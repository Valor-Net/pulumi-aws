import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { httpServices } from "../servicesConfig";
import { createAlb } from "../shared/alb";
import { createAlbIntegration, createApiMapping, createDomainName, createHttpApi, createRoute, createStage } from "../shared/apiGateway";
import { createBastionHost } from "../shared/bastion";
import { createRedisCluster } from "../shared/elastiCache";
import { createRdsInstance } from "../shared/rds";
import { createJsonSecret, createManagedSecret, getTenantCustomSettings } from "../shared/secrets";
import { createSecurityGroup } from "../shared/securityGroups";
import { createQueue } from "../shared/sqs";
import { createVpc, createVpcInterfaceEndpoint } from "../shared/vpc";
import { createVpcLink } from "../shared/vpcLink";

/* Config -------------------------------------------------- */
const stack = pulumi.getStack();
const caller = aws.getCallerIdentity({});
const certArn               = "arn:aws:acm:us-east-1:331240720676:certificate/f5811ee2-2f5e-4424-a216-5c2a794e78c3";

/* VPC -------------------------------------------------- */
const vpc = createVpc(`${stack}`);

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
const sgTasks = createSecurityGroup(`${stack}-task-sg`, vpc.vpc.id, [
    {
        fromPort: 80, toPort: 80, protocol: "tcp", securityGroups: [sgAlb.id],
    },
    {
        fromPort: 9000, toPort: 9000, protocol: "tcp", securityGroups: [sgAlb.id],
    },
]);
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
const sgVpcEndpoints = createSecurityGroup(`${stack}-vpc-endpoints-sg`, vpc.vpc.id, [{
    protocol: "tcp",
    fromPort: 443,
    toPort: 443,
    securityGroups: [sgTasks.id],
}]);
const sgFrontend = createSecurityGroup(`${stack}-frontend-sg`, vpc.vpc.id, [
    {
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    },
    {
        fromPort: 443,
        toPort: 443,
        protocol: "tcp", 
        cidrBlocks: ["0.0.0.0/0"],
    },
    {
        fromPort: 3000,
        toPort: 3000,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    },
]);

// Interface VPC Endpoints --------------------------------------*/
const vpceSecrets = createVpcInterfaceEndpoint({
    name: "vpce-secrets",
    vpcId: vpc.vpc.id,
    serviceName: `com.amazonaws.${aws.config.region}.secretsmanager`,
    subnetIds: vpc.privateSubnetIds,
    securityGroupIds: [sgVpcEndpoints.id],
    privateDnsEnabled: true,
});
const vpceSqs = createVpcInterfaceEndpoint({
    name: "vpce-sqs",
    vpcId: vpc.vpc.id,
    serviceName: `com.amazonaws.${aws.config.region}.sqs`,
    subnetIds: vpc.privateSubnetIds,
    securityGroupIds: [sgVpcEndpoints.id],
    privateDnsEnabled: true,
});

/* SQS ------------------------------------------------------------*/ 
const stagingQueue = createQueue({
    name: "valornet-staging-email-queue",
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
});
export const devQueueUrl = stagingQueue.id;

/* Bastion Host ---------------------------------------- */
const bastion = createBastionHost(`${stack}-bastion`, {
    vpcId: vpc.vpc.id,
    publicSubnetId: vpc.publicSubnetIds[0],
    keyName: "pulumi-bastion-key",
}, bastionSg.id);


/* ALB ----------------------------------------------------------------- */
const alb = createAlb(`${stack}-alb`, vpc, [sgAlb.id]);
// const frontendAlb = createAlb(`${stack}-front-alb`, vpc, [sgFrontend.id], true);



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
const initialTenants = ["demo"];
const clientsSecret = createManagedSecret(
    `${stack}-clients-secret`,
    initialTenants,
    "Lista de tenants - gerenciado pelo TenantProviderService"
);

initialTenants.forEach(tenantName => {
    const secretName = `${stack}-${tenantName}-secret`;

    const customSettings = getTenantCustomSettings(tenantName);
    const finalSettings = Object.keys(customSettings).length > 0 
        ? customSettings 
        : {};

    console.log(`🔑 Criando secret para tenant: ${tenantName}`);
    createManagedSecret(
        secretName,
        finalSettings,
        `Secret for tenant ${tenantName} - managed by TenantProviderService`
    );
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


/* API Gateway ----------------------------------------------------------- */
const httpApi = createHttpApi(`${stack}-api`);
const vpcLink = createVpcLink(`${stack}-vpclink`, vpc.privateSubnetIds);
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
const stage = createStage("default", httpApi.id, "$default");
const domain = createDomainName("api-domain", "stg.valornetvets.com", certArn);
createApiMapping("map", httpApi.id, domain.id, stage.name, "");

/* Outputs --------------------------------------------------------------- */
export const vpcId               = vpc.vpc.id;
export const privateSubnetIds    = vpc.privateSubnetIds;
export const publicSubnetIds     = vpc.publicSubnetIds;
export const sgAlbId             = sgAlb.id;
export const sgTasksId           = sgTasks.id;
export const sgDbId              = sgDb.id;
export const sgRedisId           = sgRedis.id;
export const sgVpcEndpointsId    = sgVpcEndpoints.id;
export const sgFrontendId        = sgFrontend.id;
export const albArn              = alb.loadBalancer.arn;
// export const frontendAlbArn      = frontendAlb.loadBalancer.arn;
// export const frontendListenerArn = frontendAlb.listeners.apply(l => l![0].arn);
export const listenerArn         = alb.listeners.apply(l => l![0].arn);
export const rdsEndpoint         = rds.endpoint;
export const rdsPort             = rds.port;
export const rdsUsername         = `valornet`;
export const rdsPassword         = pulumi.secret(dbPassword);
export const redisEndpoint       = redis.cacheNodes.apply(nodes => nodes![0].address);
export const vpceSecretsId       = vpceSecrets.id;
export const vpceSecretsDns      = vpceSecrets.dnsEntries;
export const vpceSqsId           = vpceSqs.id;
export const vpceSqsDns          = vpceSqs.dnsEntries;
export const stagingQueueUrl     = stagingQueue.id;
export const generalSecretArn    = clientsSecret.arn;
export const generalSecretJson   = clientsSecret;