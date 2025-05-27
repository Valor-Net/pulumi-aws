import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { createAlb, createTgAndRule } from "../shared/alb";
import {
    createAlbIntegration,
    createApiMapping,
    createDomainName,
    createHttpApi,
    createRoute,
    createStage
} from "../shared/apiGateway";

import * as random from "@pulumi/random";
import * as fs from "fs";
import { createBastionHost } from "../shared/bastion";
import { createEcsTaskRole, makeHttpFargate, makeWorkerFargate } from "../shared/ecs";
import { createRedisCluster } from "../shared/elastiCache";
import { createRdsInstance } from "../shared/rds";
import { createJsonSecret, ensureJsonSecretWithDefault, ensureTextSecret, getSecretString } from "../shared/secrets";
import { createSecurityGroup } from "../shared/securityGroups";
import { createVpc } from "../shared/vpc";
import { createVpcLink } from "../shared/vpcLink";
import { httpServices, workerServices } from "./servicesConfig";

/* Config -------------------------------------------------- */
const stack   = pulumi.getStack();
const certArn = "arn:aws:acm:us-east-1:331240720676:certificate/f5811ee2-2f5e-4424-a216-5c2a794e78c3";

/* VPC -------------------------------------------------- */
const vpc      = createVpc(`${stack}`);

/* Security Groups ---------------------------------------- */
const bastionSg = createSecurityGroup(`${stack}-bastion-sg`, vpc.vpc.id, [
    {
        fromPort: 22,
        toPort: 22,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    },
]);
const sgAlb = createSecurityGroup(`${stack}-alb-sg`, vpc.vpc.id, [{
    fromPort: 80,
    toPort: 80,
    protocol: "tcp",
    cidrBlocks: ["10.0.0.0/16"]
}]);
const sgTasks = createSecurityGroup(`${stack}-task-sg`, vpc.vpc.id, [{
    fromPort: 9000,
    toPort: 9000,
    protocol: "tcp",
    securityGroups: [sgAlb.id]
}]);
const sgDb = createSecurityGroup(`${stack}-db-sg`, vpc.vpc.id, [
    {
        fromPort: 3306,
        toPort: 3306,
        protocol: "tcp",
        securityGroups: [sgTasks.id, bastionSg.id],
    },
]);


const sgRedis = createSecurityGroup(`${stack}-redis-sg`, vpc.vpc.id, [{
    fromPort: 6379,
    toPort: 6379,
    protocol: "tcp",
    securityGroups: [sgTasks.id],
}]);

/* Bastion Host ---------------------------------------- */
const bastion = createBastionHost(`${stack}-bastion`, {
    vpcId: vpc.vpc.id,
    publicSubnetId: vpc.publicSubnetIds[0],
    keyName: "pulumi-bastion-key",
}, bastionSg.id);


/* ALB ----------------------------------------------------------------- */
const alb      = createAlb(`${stack}-alb`, vpc, [sgAlb.id]);

/* DB & REDIS --------------------------------------------- */
const dbPassword = new random.RandomPassword(`${stack}-db-password`, {
    length: 16,
    special: true,
}).result;

const rds = createRdsInstance({
    name: `${stack}-valornet-rds`,
    dbName: `valornet`,
    vpcSecurityGroupIds: [sgDb.id],
    subnetIds: vpc.privateSubnetIds,
    username: `valornet`,
    password: dbPassword.apply(p => p),
    publicAccessible: false
});

const redis = createRedisCluster({
    name: `${stack}-valornet-redis`,
    subnetIds: vpc.privateSubnetIds,
    securityGroupIds: [sgRedis.id],
});
const clientsSecret = ensureJsonSecretWithDefault(
    `${stack}-clients-secret`,
    ["demo"],
    "Lista de tenants"
);
  
const clientsJson = getSecretString(clientsSecret.id, clientsSecret);
const clientsAppKeys = {};
clientsJson.apply(str => {
    const tenants = JSON.parse(str) as string[];
    tenants.forEach(t => {
            ensureJsonSecretWithDefault(
            `${stack}-${t}-secret`,
            {},
            `Secret for tenant ${t}`
        );
    });
});

const generalSecretData = pulumi.all([rds.endpoint, rds.port, dbPassword, bastion.publicIp, bastion.publicDns, redis.cacheNodes]).apply(([endpoint, port, password, bastionIp, bastionDns, redisNode]) => ({
    host: endpoint,
    port: port,
    username: `valornet`,
    password: password,
    bastionPublicIp: bastionIp,
    bastionDns: bastionDns,
    redisEndpoint: redisNode[0].address
}));

createJsonSecret(`${stack}-general-secret`, generalSecretData, `RDS connection details for ${stack}`);


/* ECR --------------------------------------- */
const repoUrls: Record<string, pulumi.Output<string>> = {};
for(const svc of [...httpServices, ...workerServices]) {

    const repo = new aws.ecr.Repository(`${stack}-${svc.name}-repo`, {
        imageScanningConfiguration: { scanOnPush: false },
        imageTagMutability: "MUTABLE",
        encryptionConfigurations: [{ encryptionType: "AES256" }],
        tags: { service: svc.name, environment: stack },
    });
      
    new aws.ecr.LifecyclePolicy(`${stack}-${svc.name}-lifecycle`, {
        repository: repo.name,
        policy: pulumi.interpolate`{
            "rules": [{
                "rulePriority": 1,
                "description": "Keep last 3 images",
                "selection": { "tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 3 },
                "action": { "type": "expire" }
            }]
        }`,
    });


    repoUrls[svc.name] = repo.repositoryUrl;
}

/* Listener + Target Groups + ECS --------------------------------------- */

const laravelAppKey = new random.RandomPassword("app-key", {
    length: 32,
    special: false,
    overrideSpecial: "_-",
}).result.apply(p => Buffer.from(p, "utf8").toString("base64"));
const appKeySecret = ensureTextSecret(`${stack}-laravel-app-key`, laravelAppKey);

const privateKey = fs.readFileSync("./.keys/staging/oauth-private.key", "utf8");
const publicKey  = fs.readFileSync("./.keys/staging/oauth-public.key", "utf8");

const jwtPrivSecret = ensureTextSecret(`${stack}-jwt-private`, privateKey);
const jwtPubSecret  = ensureTextSecret(`${stack}-jwt-public`,  publicKey);

const listener = alb.listeners.apply(listeners => listeners![0].arn);
const cluster = new aws.ecs.Cluster(`${stack}-cluster`);
httpServices.forEach((svc, idx) => {
    const tg = createTgAndRule({
        albArn: alb.loadBalancer.arn,
        listenerArn: listener,
        svc,
        vpcId: vpc.vpc.id,
        priority: 10 + idx,
    });
    
    const taskRole = createEcsTaskRole({
        name: `${stack}-${svc.name}`,
        policies: svc.policies,
    });

    const secrets: Record<string, aws.secretsmanager.Secret> = {
        APP_KEY: appKeySecret,
    };
    
    if (svc.path === "auth") {
        secrets.OAUTH_PRIVATE_KEY = jwtPrivSecret;
        secrets.OAUTH_PUBLIC_KEY = jwtPubSecret;
    }

    makeHttpFargate({
        svc: { name: svc.name, image: svc.image, port: svc.port},
        clusterArn: cluster.arn,
        tg,
        sgIds:   [sgTasks.id],
        subnets: vpc.privateSubnetIds,
        taskRole,
        env: {
            APP_NAME: "AuthService",
            APP_ENV: "staging",
            APP_DEBUG: "false",
            APP_URL: "https://stg.valornetvets.com",
            QUEUE_CONNECTION: "sqs",
            REDIS_CLIENT: "phpredis",
            REDIS_HOST: redis.cacheNodes.apply(nodes => nodes[0].address),
            REDIS_PORT: "6379",
            AWS_EC2_METADATA_DISABLED: "true",
            AWS_DEFAULT_REGION: aws.config.requireRegion(),
        },
        secrets
    })
    
});

workerServices.forEach(w =>
    makeWorkerFargate({
        svc: { name: w.name, image: w.image, command: w.command },
        clusterArn: cluster.arn,
        sgIds:   [sgTasks.id],
        subnets: vpc.privateSubnetIds,
    })
);

/* API Gateway ----------------------------------------------------------- */
const httpApi  = createHttpApi(`${stack}-api`);
const vpcLink  = createVpcLink(`${stack}-vpclink`, vpc.privateSubnetIds);
const albInt = alb.listeners.apply(listeners => {
    if (!listeners || listeners.length === 0) {
        throw new Error("No listeners available on ALB.");
    }
    return createAlbIntegration(
        `${stack}-int`,
        httpApi.id,
        vpcLink.id,
        listeners[0].arn
    );
});


httpServices.forEach(s =>
    createRoute(`${s.name}-route`, httpApi.id, `ANY /${s.path}/v1/{proxy+}`, albInt.id)
);

/* Stage + Domain -------------------------------------------------------- */
const stage  = createStage("default", httpApi.id, "$default");
const domain = createDomainName("api-domain", "stg.valornetvets.com", certArn);
createApiMapping("map", httpApi.id, domain.id, stage.name, "");

/* Outputs --------------------------------------------------------------- */
// Register Pulumi stack outputs
export const apiUrl = httpApi.apiEndpoint;
export const ecrRepoUrls = repoUrls;
export const apiDomainTarget = domain.domainNameConfiguration.targetDomainName;

// Database credentials
export const rdsEndpoint = rds.endpoint;
export const rdsPort = rds.port;
export const rdsUsername = `valornet`;
export const rdsPassword = pulumi.secret(dbPassword);

// Redis endpoint
export const redisEndpoint = redis.cacheNodes.apply(nodes => nodes[0].address);
