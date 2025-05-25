import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { createAlb } from "../shared/alb";
import {
    createAlbIntegration,
    createApiMapping,
    createDomainName,
    createHttpApi,
    createRoute,
    createStage
} from "../shared/apiGateway";

import * as random from "@pulumi/random";
import { createRedisCluster } from "../shared/elastiCache";
import { createRdsInstance } from "../shared/rds";
import { createJsonSecret, ensureSecret, getSecretValue } from "../shared/secrets";
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
const sgAlb = createSecurityGroup(`${stack}-alb-sg`, vpc.vpc.id, [{
    fromPort: 80,
    toPort: 80,
    protocol: "tcp",
    cidrBlocks: ["10.0.0.0/16"]
}]);
const sgTasks = createSecurityGroup(`${stack}-task-sg`, vpc.vpc.id, [{
    fromPort: 80,
    toPort: 80,
    protocol: "tcp",
    securityGroups: [sgAlb.id]
}]);
const sgDb = createSecurityGroup(`${stack}-db-sg`, vpc.vpc.id, [
    {
        fromPort: 3306,
        toPort: 3306,
        protocol: "tcp",
        securityGroups: [sgTasks.id],
    },
    {
        fromPort: 3306,
        toPort: 3306,
        protocol: "tcp",
        cidrBlocks: ["177.10.88.74/32"],
    },
]);
const sgRedis = createSecurityGroup(`${stack}-redis-sg`, vpc.vpc.id, [{
    fromPort: 6379,
    toPort: 6379,
    protocol: "tcp",
    securityGroups: [sgTasks.id],
}]);

/* ALB ----------------------------------------------------------------- */
const alb      = createAlb(`${stack}-alb`, vpc, [sgAlb.id]);

/* DB & REDIS --------------------------------------------- */
const dbPassword = new random.RandomPassword(`${stack}-db-password`, {
    length: 16,
    special: true,
}).result;

const rds = createRdsInstance({
    name: `${stack}-valornet-rds`,
    dbName: `${stack}CentralDb`,
    vpcSecurityGroupIds: [sgDb.id],
    subnetIds: vpc.privateSubnetIds,
    username: `${stack}valornet`,
    password: dbPassword.apply(p => p),
    publicpubliclyAccessible: true
});

const redis = createRedisCluster({
    name: `${stack}-valornet-redis`,
    subnetIds: vpc.privateSubnetIds,
    securityGroupIds: [sgRedis.id],
});

const clientsSecretName = `${stack}-clients-secret`;
ensureSecret(clientsSecretName);

getSecretValue(clientsSecretName).then(secretValue => {
    if (!secretValue) {
        console.warn(`⚠️ No clients found in ${clientsSecretName}. Skipping client secrets creation.`);
        return;
    }

    const clients = JSON.parse(secretValue) as string[];

    clients.forEach(client => {
        const clientSecretName = `${stack}-${client}-secret`;
        ensureSecret(clientSecretName, `Secret for client ${client}`);
    });
});

const rdsConnectionData = pulumi.all([rds.endpoint, rds.port, dbPassword]).apply(([endpoint, port, password]) => ({
    host: endpoint,
    port: port,
    username: `${stack}-valornet`,
    password: password,
}));

createJsonSecret(`${stack}-rds-connection-secret`, rdsConnectionData, `RDS connection details for ${stack}`);


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
// const listener = new aws.lb.Listener(`${stack}-http`, {
//   loadBalancerArn: alb.loadBalancer.arn,
//   port: 80, protocol: "HTTP",
//   defaultActions: [{ type: "fixed-response", fixedResponse: {statusCode:"404", contentType:"text/plain"} }],
// });

// const cluster = new aws.ecs.Cluster(`${stack}-cluster`);

// httpServices.forEach((svc, idx) => {
//     const tg = createTgAndRule({
//         albArn: alb.loadBalancer.arn,
//         listenerArn: listener.arn,
//         svc,
//         vpcId: vpc.vpc.id,
//         priority: 10 + idx,
//     });
    
//     const taskRole = createEcsTaskRole({
//         name: `${stack}-${svc.name}`,
//         policies: svc.policies,
//     });

//     makeHttpFargate({
//         svc: { name: svc.name, image: svc.image },
//         clusterArn: cluster.arn,
//         tg,
//         sgIds:   [sgTasks.id],
//         subnets: vpc.privateSubnetIds,
//         taskRole
//     })
    
// });

// workerServices.forEach(w =>
//     makeWorkerFargate({
//         svc: { name: w.name, image: w.image, command: w.command },
//         clusterArn: cluster.arn,
//         sgIds:   [sgTasks.id],
//         subnets: vpc.privateSubnetIds,
//     })
// );

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
export const apiUrl = pulumi.Output.create(httpApi.apiEndpoint);
export const ecrRepoUrls = pulumi.Output.create(repoUrls);
export const apiDomainTarget = pulumi.Output.create(domain.domainNameConfiguration.targetDomainName);

export const rdsEndpoint = pulumi.Output.create(rds.endpoint);
export const rdsPort = pulumi.Output.create(rds.port);
export const rdsUsername = pulumi.Output.create(`${stack}-valornet`);
export const rdsPassword = pulumi.Output.create(pulumi.secret(dbPassword.apply(p => p)));

export const redisEndpoint = pulumi.Output.create(redis.cacheNodes.apply(nodes => nodes[0].address));
