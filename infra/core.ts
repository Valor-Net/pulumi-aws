// customers/quest/quest-core/index.ts
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { createAlb } from "./shared/alb";
import { createAlbIntegration, createApiMapping, createDomainName, createHttpApi, createStage } from "./shared/apiGateway";
import { createBastionHost } from "./shared/bastion";
import { resolveCoreConfig } from "./shared/configResolver";
import { createRedisCluster } from "./shared/elastiCache";
import { createRdsInstance } from "./shared/rds";
import { createJsonSecret, ensureSecret } from "./shared/secrets";
import { createSecurityGroup } from "./shared/securityGroups";
import { createQueue } from "./shared/sqs";
import { createVpc, createVpcInterfaceEndpoint } from "./shared/vpc";
import { createVpcLink } from "./shared/vpcLink";


/* Load Config -------------------------------------------------- */
const stack = pulumi.getStack();
const [customer, env] = stack.split("-");
const coreConfig = resolveCoreConfig(`configs/customers/${customer}/${customer}.${env}.json`);

console.log(`🚀 Deploying ${coreConfig.customer} Core Infrastructure`);

/* VPC -------------------------------------------------- */
const vpc = createVpc(`${stack}`, {
    cidrBlock: coreConfig.vpc.cidrBlock,
    enableDnsHostnames: coreConfig.vpc.enableDnsHostnames,
    azCount: coreConfig.vpc.azCount,
});

/* Security Groups (Dynamic from config) ----------------------- */
const securityGroups: Record<string, pulumi.Output<string>> = {};

// Helper to resolve SG references
const resolveSgReferences = (rule: any): any => {
    const resolved = { ...rule };
    
    if (rule.sourceSecurityGroup && typeof rule.sourceSecurityGroup === "string") {
        resolved.securityGroups = [securityGroups[rule.sourceSecurityGroup]];
        delete resolved.sourceSecurityGroup;
    }
    
    if (rule.sourceSecurityGroups && Array.isArray(rule.sourceSecurityGroups)) {
        resolved.securityGroups = rule.sourceSecurityGroups.map((sg: string) => securityGroups[sg]);
        delete resolved.sourceSecurityGroups;
    }
    
    return resolved;
};

// Create security groups in order (bastion first, then others can reference it)
const sgOrder = ["bastion", "alb", "tasks", "db", "redis", "frontend", "vpcEndpoints"];

sgOrder.forEach((sgName) => {
    const sgConfig = coreConfig.securityGroups[sgName];
    if (!sgConfig) return;

    const ingress = (sgConfig.ingress || []).map(resolveSgReferences);
    const egress = (sgConfig.egress || []).map(resolveSgReferences);

    const sg = createSecurityGroup(
        `${stack}-${sgName}-sg`,
        vpc.vpc.id,
        ingress,
        egress.length > 0 ? egress : undefined
    );

    securityGroups[sgName] = sg.id;
});

/* VPC Endpoints ------------------------------------------------ */
const vpcEndpoints: Record<string, any> = {};

coreConfig.vpcEndpoints.forEach((endpoint) => {
    const vpce = createVpcInterfaceEndpoint({
        name: `${stack}-${endpoint.name}`,
        vpcId: vpc.vpc.id,
        serviceName: `com.amazonaws.${aws.config.region}.${endpoint.serviceName}`,
        subnetIds: vpc.privateSubnetIds,
        securityGroupIds: [securityGroups.vpcEndpoints],
        privateDnsEnabled: endpoint.privateDnsEnabled,
    });

    vpcEndpoints[endpoint.name] = vpce;
});

/* Bastion Host ------------------------------------------------- */
let bastion: any = null;
if (coreConfig.bastion?.enabled) {
    bastion = createBastionHost(`${stack}-bastion`, {
        vpcId: vpc.vpc.id,
        publicSubnetId: vpc.publicSubnetIds[0],
        keyName: coreConfig.bastion.keyName,
        instanceType: coreConfig.bastion.instanceType,
    }, securityGroups.bastion);
}

/* RDS (Staging + Production) ----------------------------------- */
const rdsInstances: Record<string, any> = {};
const rdsPasswords: Record<string, pulumi.Output<string>> = {};

["staging", "production"].forEach((env) => {
    const rdsConfig = coreConfig.rds[env as "staging" | "production"];
    
    const password = new random.RandomPassword(`${stack}-${env}-db-password`, {
        length: 16,
        special: true,
    }).result;
    
    rdsPasswords[env] = password;

    const rds = createRdsInstance({
        name: rdsConfig.identifier,
        dbName: rdsConfig.dbName,
        vpcSecurityGroupIds: [securityGroups.db],
        subnetIds: vpc.privateSubnetIds,
        username: rdsConfig.username,
        password: password,
        publicAccessible: rdsConfig.publiclyAccessible,
        instanceClass: rdsConfig.instanceClass,
        allocatedStorage: rdsConfig.allocatedStorage,
        engine: rdsConfig.engine,
        engineVersion: rdsConfig.engineVersion,
        backupRetentionPeriod: rdsConfig.backupRetentionPeriod,
        skipFinalSnapshot: rdsConfig.skipFinalSnapshot,
        multiAz: rdsConfig.multiAz,
    });

    rdsInstances[env] = rds;
});

/* Redis (Staging + Production) --------------------------------- */
const redisInstances: Record<string, any> = {};

["staging", "production"].forEach((env) => {
    const redisConfig = coreConfig.redis[env as "staging" | "production"];
    
    const redis = createRedisCluster({
        name: `${stack}-${env}-redis`,
        subnetIds: vpc.privateSubnetIds,
        securityGroupIds: [securityGroups.redis],
        nodeType: redisConfig.nodeType,
        numCacheNodes: redisConfig.numCacheNodes,
        engineVersion: redisConfig.engineVersion,
    });

    redisInstances[env] = redis;
});


/* SQS Queues (per environment) --------------------------------- */
const queues: Record<string, Record<string, any>> = {
    staging: {},
    production: {},
};

["staging", "production"].forEach((env) => {
    coreConfig.sqs.queues.forEach((queueConfig) => {
        // Create DLQ
        const dlq = createQueue({
            name: `${stack}-${env}-${queueConfig.name}-dlq`,
            tags: {
                ...queueConfig.tags,
                Environment: env,
            },
        });

        // Create main queue
        const queue = createQueue({
            name: `${stack}-${env}-${queueConfig.name}`,
            visibilityTimeoutSeconds: queueConfig.visibilityTimeoutSeconds,
            messageRetentionSeconds: queueConfig.messageRetentionSeconds,
            redrivePolicy: dlq.arn.apply((dlqArn) =>
                JSON.stringify({
                    deadLetterTargetArn: dlqArn,
                    maxReceiveCount: queueConfig.maxReceiveCount,
                })
            ),
            tags: {
                ...queueConfig.tags,
                Environment: env,
            },
        });

        queues[env][queueConfig.name] = queue;
        queues[env][`${queueConfig.name}-dlq`] = dlq;
    });
});

/* ALBs (Backend + Frontend per environment) ------------------- */
const albs: Record<string, Record<string, any>> = {
    staging: {},
    production: {},
};


["staging", "production"].forEach((env) => {
    type env = "staging" | "production";

    // Backend ALB
    const backendAlb = createAlb(
        coreConfig.alb.backend[env as env].name,
        vpc,
        [securityGroups.alb],
        coreConfig.alb.backend[env as env].internal
    );
    albs[env].backend = backendAlb;

    // Frontend ALB
    const frontendAlb = createAlb(
        coreConfig.alb.frontend[env as env].name,
        vpc,
        [securityGroups.frontend],
        coreConfig.alb.frontend[env as env].internal
    );
    albs[env].frontend = frontendAlb;

    // Frontend HTTPS Listener
    const httpsListener = new aws.lb.Listener(`${stack}-${env}-https-listener`, {
        loadBalancerArn: frontendAlb.loadBalancer.arn,
        port: 443,
        protocol: "HTTPS",
        sslPolicy: "ELBSecurityPolicy-2016-08",
        certificateArn: coreConfig.apiGateway[env as env].certificateArn,
        defaultActions: [{
            type: "forward",
            targetGroupArn: frontendAlb.defaultTargetGroup.arn,
        }],
    });

    albs[env].frontendHttpsListener = httpsListener;
});

/* VPC Links (per environment) ---------------------------------- */
const vpcLinks: Record<string, any> = {};

["staging", "production"].forEach((env) => {
    type env = "staging" | "production";
    const vpcLink = createVpcLink(
        coreConfig.vpcLink[env as env].name,
        vpc.privateSubnetIds
    );

    vpcLinks[env] = vpcLink;
});

/* API Gateways (per environment) ------------------------------- */
const apiGateways: Record<string, any> = {};

["staging", "production"].forEach((env) => {
    type env = "staging" | "production";

    const httpApi = createHttpApi(coreConfig.apiGateway[env as env].name);
    
    const albIntegration = albs[env].backend.listeners.apply((listeners: any) => {
        if (!listeners || listeners.length === 0) {
            throw new Error(`No listeners available on ${env} backend ALB`);
        }
        return createAlbIntegration(
            `${stack}-${env}-alb-int`,
            httpApi.id,
            vpcLinks[env].id,
            listeners[0].arn
        );
    });

    const stage = createStage(`${env}-stage`, httpApi.id, "$default");
    const domain = createDomainName(
        `${env}-api-domain`,
        coreConfig.apiGateway[env as env].domain,
        coreConfig.apiGateway[env as env].certificateArn
    );
    createApiMapping(`${env}-api-map`, httpApi.id, domain.id, stage.name, "");

    apiGateways[env] = {
        httpApi,
        albIntegration,
        stage,
        domain,
    };
});

/* Private DNS Namespace ---------------------------------------- */
const privateDnsNs = new aws.servicediscovery.PrivateDnsNamespace(`${stack}-services-ns`, {
    name: coreConfig.privateDns.namespace,
    vpc: vpc.vpc.id,
    description: coreConfig.privateDns.description,
});

/* Secrets (per environment) ------------------------------------ */

/* Secrets (per environment) ------------------------------------ */
const secrets: Record<string, Record<string, any>> = {
    staging: {},
    production: {},
};

["staging", "production"].forEach((env) => {
    // Agora tokens
    if (coreConfig.secrets?.agora) {
        ensureSecret(
            `${stack}-${env}-${coreConfig.secrets.agora.name}`,
            `${env} ${coreConfig.secrets.agora.description}`
        );
    }

    // General secret with DB, Redis, Bastion info
    const generalSecretData = pulumi.all([
        rdsInstances[env].endpoint,
        rdsInstances[env].port,
        rdsPasswords[env],
        bastion?.publicIp || pulumi.output(""),
        bastion?.publicDns || pulumi.output(""),
        redisInstances[env].cacheNodes,
    ]).apply(([endpoint, port, password, bastionIp, bastionDns, redisNodes]) => ({
        host: endpoint,
        port: port,
        username: coreConfig.rds[env as "staging" | "production"].username,
        password: password,
        bastionPublicIp: bastionIp,
        bastionDns: bastionDns,
        redisEndpoint: redisNodes[0].address,
    }));

    const generalSecret = createJsonSecret(
        `${stack}-${env}-secret`,
        generalSecretData,
        `RDS connection details for ${stack} ${env}`
    );

    secrets[env].general = generalSecret;
});
export function getExports() {
    return {
        // VPC
        vpcId: vpc.vpc.id,
        privateSubnetIds: vpc.privateSubnetIds,
        publicSubnetIds: vpc.publicSubnetIds,

        // Security Groups
        sgBastionId: securityGroups.bastion,
        sgAlbId: securityGroups.alb,
        sgTasksId: securityGroups.tasks,
        sgDbId: securityGroups.db,
        sgRedisId: securityGroups.redis,
        sgVpcEndpointsId: securityGroups.vpcEndpoints,
        sgFrontendId: securityGroups.frontend,

        // Bastion
        bastionPublicIp: bastion?.publicIp || pulumi.output(""),
        bastionPublicDns: bastion?.publicDns || pulumi.output(""),

        // Staging Resources
        staging: {
            // RDS
            rdsEndpoint: pulumi.unsecret(rdsInstances.staging.endpoint),
            rdsPort: pulumi.unsecret(rdsInstances.staging.port),
            rdsUsername: coreConfig.rds.staging.username,
            rdsPassword: pulumi.secret(rdsPasswords.staging),
            rdsDbName: coreConfig.rds.staging.dbName,

            // Redis
            redisEndpoint: redisInstances.staging.cacheNodes.apply((nodes: any) => 
                pulumi.unsecret(pulumi.output(nodes[0].address))
            ),

            // SQS Queues
            notificationsQueue: queues.staging.notifications.name,
            notificationsQueueArn: queues.staging.notifications.arn,
            emailQueue: queues.staging.email.name,
            emailQueueArn: queues.staging.email.arn,
            pdfQueue: queues.staging.pdf.name,
            pdfQueueArn: queues.staging.pdf.arn,

            // ALBs
            backendAlbArn: albs.staging.backend.loadBalancer.arn,
            backendAlbDns: albs.staging.backend.loadBalancer.dnsName,
            backendListenerArn: albs.staging.backend.listeners.apply((l: any) => l[0].arn),
            
            frontendAlbArn: albs.staging.frontend.loadBalancer.arn,
            frontendAlbDns: albs.staging.frontend.loadBalancer.dnsName,
            frontendListenerArn: albs.staging.frontend.listeners.apply((l: any) => l[0].arn),
            frontendHttpsListenerArn: albs.staging.frontendHttpsListener.arn,

            // VPC Link
            vpcLinkId: vpcLinks.staging.id,

            // API Gateway
            apiGatewayId: apiGateways.staging.httpApi.id,
            apiGatewayEndpoint: apiGateways.staging.httpApi.apiEndpoint,
            apiDomain: apiGateways.staging.domain.domainName,
            albIntegrationId: apiGateways.staging.albIntegration.id,

            // Secrets
            generalSecretArn: secrets.staging.general.arn,
        },

        // Production Resources
        production: {
            // RDS
            rdsEndpoint: pulumi.unsecret(rdsInstances.production.endpoint),
            rdsPort: pulumi.unsecret(rdsInstances.production.port),
            rdsUsername: coreConfig.rds.production.username,
            rdsPassword: pulumi.secret(rdsPasswords.production),
            rdsDbName: coreConfig.rds.production.dbName,

            // Redis
            redisEndpoint: redisInstances.production.cacheNodes.apply((nodes: any) => 
                pulumi.unsecret(pulumi.output(nodes[0].address))
            ),

            // SQS Queues
            notificationsQueue: queues.production.notifications.name,
            notificationsQueueArn: queues.production.notifications.arn,
            emailQueue: queues.production.email.name,
            emailQueueArn: queues.production.email.arn,
            pdfQueue: queues.production.pdf.name,
            pdfQueueArn: queues.production.pdf.arn,

            // ALBs
            backendAlbArn: albs.production.backend.loadBalancer.arn,
            backendAlbDns: albs.production.backend.loadBalancer.dnsName,
            backendListenerArn: albs.production.backend.listeners.apply((l: any) => l[0].arn),
            
            frontendAlbArn: albs.production.frontend.loadBalancer.arn,
            frontendAlbDns: albs.production.frontend.loadBalancer.dnsName,
            frontendListenerArn: albs.production.frontend.listeners.apply((l: any) => l[0].arn),
            frontendHttpsListenerArn: albs.production.frontendHttpsListener.arn,

            // VPC Link
            vpcLinkId: vpcLinks.production.id,

            // API Gateway
            apiGatewayId: apiGateways.production.httpApi.id,
            apiGatewayEndpoint: apiGateways.production.httpApi.apiEndpoint,
            apiDomain: apiGateways.production.domain.domainName,
            albIntegrationId: apiGateways.production.albIntegration.id,

            // Secrets
            generalSecretArn: secrets.production.general.arn,
        },

        // VPC Endpoints
        vpceSecretsId: vpcEndpoints.secretsmanager.id,
        vpceSecretsDns: vpcEndpoints.secretsmanager.dnsEntries,
        vpceSqsId: vpcEndpoints.sqs.id,
        vpceSqsDns: vpcEndpoints.sqs.dnsEntries,

        // Private DNS
        privDnsNsId: privateDnsNs.id,
        privDnsNamespace: coreConfig.privateDns.namespace,

        // Config
        customer: coreConfig.customer,
    };
}