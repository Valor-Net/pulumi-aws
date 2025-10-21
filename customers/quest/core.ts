import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { goServices, laravelServices } from "../../infra/servicesConfig";
import { createAlb } from "../../infra/shared/alb";
import { createAlbIntegration, createApiMapping, createDomainName, createHttpApi, createRoute, createStage } from "../../infra/shared/apiGateway";
import { createBastionHost } from "../../infra/shared/bastion";
import { createRedisCluster } from "../../infra/shared/elastiCache";
import { createRdsInstance } from "../../infra/shared/rds";
import { createJsonSecret, ensureSecret } from "../../infra/shared/secrets";
import { createSecurityGroup } from "../../infra/shared/securityGroups";
import { createQueue } from "../../infra/shared/sqs";
import { createVpc, createVpcInterfaceEndpoint } from "../../infra/shared/vpc";
import { createVpcLink } from "../../infra/shared/vpcLink";
import { resolveConfig } from './../../infra/shared/configResolver';

/* Config -------------------------------------------------- */
const stack = pulumi.getStack();
const config = resolveConfig({
    customerPath: "configs/customers/quest.staging.json",
});
// const certArn               = "arn:aws:acm:us-east-1:331240720676:certificate/f5811ee2-2f5e-4424-a216-5c2a794e78c3";
const certArn               = "arn:aws:acm:us-east-1:331240720676:certificate/be56385a-0d8e-4ec0-807a-958622aea2d5";

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
    {
        fromPort: 8080, toPort: 8080, protocol: "tcp", securityGroups: [sgAlb.id],
    },
    {
        fromPort: 0, toPort: 65535, protocol: "tcp", self: true,
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
], [
    {
        fromPort: 443,
        toPort: 443,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    },
    {
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"]
    }
]);
const sgVpcEndpoints = createSecurityGroup(`${stack}-vpc-endpoints-sg`, vpc.vpc.id, [{
    protocol: "tcp",
    fromPort: 443,
    toPort: 443,
    securityGroups: [sgTasks.id, sgFrontend.id],
}]);


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

const notificationsDlq = createQueue({
    name: `${stack}-notifications-dlq`,
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
});
const notificationsQueue = createQueue({
    name: `${stack}-notifications-queue`,
    redrivePolicy: notificationsDlq.arn.apply(dlqArn =>
        JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: 3,
        })
    ),
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
});


const emailDlq = createQueue({
    name: `${stack}-email-dlq`,
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
});
const emailQueue = createQueue({
    name: `${stack}-email-queue`,
    redrivePolicy: emailDlq.arn.apply(dlqArn =>
        JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: 3,
        })
    ),
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
    
});

const pdfDlq = createQueue({
    name: `${stack}-pdf-dlq`,
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
});
const pdfQueue = createQueue({
    name: `${stack}-pdf-queue`,
    redrivePolicy: pdfDlq.arn.apply(dlqArn =>
        JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: 3,
        })
    ),
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
    
});
export const devQueueUrl = emailQueue.id;
export const devPdfQueueUrl = pdfQueue.id;

/* Bastion Host ---------------------------------------- */
const bastion = createBastionHost(`${stack}-bastion`, {
    vpcId: vpc.vpc.id,
    publicSubnetId: vpc.publicSubnetIds[0],
    keyName: "pulumi-bastion-key",
}, bastionSg.id);


/* ALB ----------------------------------------------------------------- */
const alb = createAlb(`${stack}-alb`, vpc, [sgAlb.id]);
const frontendAlb = createAlb(`${stack}-front-alb`, vpc, [sgFrontend.id], true);

const httpsListener = new aws.lb.Listener(`${stack}-https-listener`, {
    loadBalancerArn: frontendAlb.loadBalancer.arn,
    port: 443,
    protocol: "HTTPS",
    sslPolicy: "ELBSecurityPolicy-2016-08",
    certificateArn: certArn,
    defaultActions: [{
        type: "forward",
        targetGroupArn: frontendAlb.defaultTargetGroup.arn,
    }],
});


/* DB & REDIS --------------------------------------------- */
const dbPassword = new random.RandomPassword(`${stack}-db-password`, {
    length: 16,
    special: true,
}).result;

const rds = createRdsInstance({
    name: `${stack}-rds`,
    dbName: `staging`,
    vpcSecurityGroupIds: [sgDb.id],
    subnetIds: vpc.privateSubnetIds,
    username: `quest`,
    password: dbPassword.apply(p => p),
    publicAccessible: false
});

const redis = createRedisCluster({
    name: `${stack}-redis`,
    subnetIds: vpc.privateSubnetIds,
    securityGroupIds: [sgRedis.id],
});


ensureSecret(`${stack}-agora-tokens`, `${stack} Agora tokens - Used to create RTC tokens`);

const generalSecretData = pulumi.all([rds.endpoint, rds.port, dbPassword, bastion.publicIp, bastion.publicDns, redis.cacheNodes]).apply(([endpoint, port, password, bastionIp, bastionDns, redisNode]) => ({
    host: endpoint,
    port: port,
    username: `quest`,
    password: password,
    bastionPublicIp: bastionIp,
    bastionDns: bastionDns,
    redisEndpoint: redisNode[0].address
}));

createJsonSecret(`${stack}-secret`, generalSecretData, `RDS connection details for ${stack}`);


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


[...laravelServices, ...goServices].forEach(s =>
    createRoute(`${s.name}-route`, httpApi.id, `ANY /${s.path}/v1/{proxy+}`, albInt.id)
);

/* Stage + Domain -------------------------------------------------------- */
const stage = createStage("default", httpApi.id, "$default");
const domain = createDomainName("api-domain", "stg.valornetvets.com", certArn);
createApiMapping("map", httpApi.id, domain.id, stage.name, "");

/* Private DNS ------------------------------------------------------------ */

const privateDnsNs = new aws.servicediscovery.PrivateDnsNamespace(`${stack}-services-ns`, {
    name: `${stack}.local`,
    vpc: vpc.vpc.id,
    description: `Private DNS namespace for ${stack} services`,
});


/* Outputs --------------------------------------------------------------- */
export function getExports() {
    return {
        vpcId: vpc.vpc.id,
        privateSubnetIds: vpc.privateSubnetIds,
        publicSubnetIds: vpc.publicSubnetIds,
        sgAlbId: sgAlb.id,
        sgTasksId: sgTasks.id,
        sgDbId: sgDb.id,
        sgRedisId: sgRedis.id,
        sgVpcEndpointsId: sgVpcEndpoints.id,
        sgFrontendId: sgFrontend.id,
        albArn: alb.loadBalancer.arn,
        frontendAlbArn: frontendAlb.loadBalancer.arn,
        frontendAlbDns: frontendAlb.loadBalancer.dnsName,
        frontendlistenerArn: frontendAlb.listeners.apply(l => l![0].arn),
        frontendHttpsListenerArn: httpsListener.arn,
        listenerArn: alb.listeners.apply(l => l![0].arn),
        rdsEndpoint: pulumi.unsecret(rds.endpoint),
        rdsPort: pulumi.unsecret(rds.port),
        rdsUsername: "valornet",
        redisEndpoint: redis.cacheNodes.apply(nodes => pulumi.unsecret(pulumi.output(nodes![0].address))),
        vpceSecretsId: vpceSecrets.id,
        vpceSecretsDns: vpceSecrets.dnsEntries,
        vpceSqsId: vpceSqs.id,
        vpceSqsDns: vpceSqs.dnsEntries,
        emailQueue: emailQueue.name,
        notificationsQueue: notificationsQueue.name,
        pdfQueue: pdfQueue.name,
        generalSecretArn: clientsSecret.arn,
        privDnsNsId: privateDnsNs.id,
        rdsPassword: pulumi.secret(dbPassword),
    };
}