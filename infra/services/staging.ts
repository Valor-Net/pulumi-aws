// infra/services/staging.ts
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { frontendServices, httpServices, workerServices } from "../servicesConfig";
import { createFrontendTgAndRule, createTgAndRule } from "../shared/alb";
import { createEcrRepo } from "../shared/ecr";
import { createEcsTaskRole, createSdService, makeHttpFargate, makeWorkerFargate } from "../shared/ecs";
import {
    ensureTextSecret,
    getKeyFromSecretsOrFile,
    getTenantSecret
} from "../shared/secrets";

/* Config -------------------------------------------------- */
const stack                 = pulumi.getStack();
const core                  = new pulumi.StackReference("organization/infra/staging-core");
const config                = new pulumi.Config("valornet-infra");
const vpcId                 = core.getOutput("vpcId");
const privateSubnetIds      = core.getOutput("privateSubnetIds");
const publicSubnetIds       = core.getOutput("publicSubnetIds");
const sgTasksId             = core.getOutput("sgTasksId");
const sgFrontendId          = core.getOutput("sgFrontendId");
const listenerArn           = core.getOutput("listenerArn");
const albArn                = core.getOutput("albArn");
const frontendAlbArn        = core.getOutput("frontendAlbArn");
const redisEndpoint         = core.getOutput("redisEndpoint");
const emailQueue            = core.getOutput("emailQueue");
const generalSecretArn      = core.getOutput("generalSecretArn");
const frontendlistenerArn   = core.getOutput("frontendlistenerArn");
const privDnsNsId           = core.getOutput("privDnsNsId");
const generalSecret         = pulumi.output(generalSecretArn).apply(arn => aws.secretsmanager.Secret.get("general-secret", arn));
const caller                = aws.getCallerIdentity({});
const accountId             = caller.then(c => c.accountId);

/* ECS Cluster -------------------------------------------------- */
const cluster = new aws.ecs.Cluster(`${stack}-cluster`, {
    name: `${stack}-cluster`,
});

/* ECR repos -------------------------------------------------- */
const repoUrls: Record<string, pulumi.Output<string>> = {};
for (const svc of [...httpServices, ...workerServices, ...frontendServices]) {
    const repo = createEcrRepo(`${stack}-${svc.name}-repo`, stack, svc);
    repoUrls[svc.name] = repo.repositoryUrl;

    if (svc.nginxSidecarImageRepo) {
        const nginxRepo = createEcrRepo(
            `${stack}-${svc.name}-nginx-repo`,
            stack,
            { ...svc, name: `${svc.name}-nginx` }
        );
        repoUrls[`${svc.name}-nginx`] = nginxRepo.repositoryUrl;
    }
}

/* Services -----------------------------------------------*/
const laravelAppKey = new random.RandomPassword("app-key", {
    length: 32,
    special: false,
    overrideSpecial: "_-",
}).result.apply(p => Buffer.from(p, "utf8").toString("base64"));

const appKeySecret = ensureTextSecret(`${stack}-app-key`, laravelAppKey);

const privateKey = getKeyFromSecretsOrFile("OAUTH_PRIVATE_KEY", "./.keys/staging/oauth-private.key");
const publicKey = getKeyFromSecretsOrFile("OAUTH_PUBLIC_KEY", "./.keys/staging/oauth-public.key");

const jwtPrivSecret = ensureTextSecret(`private-key-${stack}`, privateKey);
const jwtPubSecret = ensureTextSecret(`public-key-${stack}`, publicKey);

httpServices.forEach((svc, idx) => {

    // if(svc.name == "crisis-line-service"){
    //     return;
    // }

    const imageTag = config.require(`${svc.name}.imageTag`);
   
    const targetPort = svc.nginxSidecarImageRepo ? 80 : svc.port;
    
    const tg = createTgAndRule({
        albArn: albArn,
        listenerArn: listenerArn,
        svc: { ...svc, port: targetPort },
        vpcId: vpcId,
        priority: 10 + idx,
    });

    const taskRole = createEcsTaskRole({
        name:     `${stack}-${svc.name}`,
        policies: svc.policies,
    });

    const env: Record<string, pulumi.Input<string>> = {
        APP_NAME:            svc.envName,
        APP_ENV:             "staging",
        APP_DEBUG:           "false",
        APP_URL:             "https://stg.valornetvets.com",
        QUEUE_CONNECTION:    "sqs",
        REDIS_CLIENT:        "phpredis",
        REDIS_HOST:          redisEndpoint,
        REDIS_PORT:          "6379",
        AWS_ACCOUNT_ID:      pulumi.interpolate`${accountId}`,
        AWS_DEFAULT_REGION:  aws.config.requireRegion(),
        SQS_PREFIX:          pulumi.interpolate`https://sqs.${aws.config.region}.amazonaws.com/${accountId}`,
        SQS_QUEUE:           emailQueue,
        TENANT_SECRET_NAME:  "staging-core-secret",
    };

    const secrets: Record<string, aws.secretsmanager.Secret> = svc.tech === 'laravel' ? {
        APP_KEY: appKeySecret,
    } : {};

    if (svc.path === "auth") {
        secrets.OAUTH_PRIVATE_KEY = jwtPrivSecret;
        secrets.OAUTH_PUBLIC_KEY = jwtPubSecret;
    }

    if(svc.path !== 'auth'){
        env.AUTH_SERVICE_JWKS_URL = pulumi.interpolate`http://auth-service.${stack}.local/auth/v1/.well-known/jwks.json`
    }

    const serviceDiscovery = svc.path === 'auth' ? createSdService(svc.name, privDnsNsId) : undefined

    makeHttpFargate({
        svc: { name: svc.name, imageRepo: svc.imageRepo, imageTag: imageTag, port: svc.port },
        clusterArn: cluster.arn,
        tg,
        sgIds: [sgTasksId],
        subnets: privateSubnetIds,
        taskRole,
        env,
        secrets,
        nginxSidecarImageRepo: svc.nginxSidecarImageRepo,
        serviceDiscovery
    })

    
});

workerServices.forEach((wsvc) => {
    const imageTag = config.require(`${wsvc.name}.imageTag`);

    const taskRole = createEcsTaskRole({
        name:     `${stack}-${wsvc.name}`,
        policies: wsvc.policies,
    });

    const env: Record<string, pulumi.Input<string>> = {
        APP_NAME:            wsvc.envName,
        APP_ENV:             "staging",
        APP_DEBUG:           "false",
        APP_URL:             "https://stg.valornetvets.com",
        QUEUE_CONNECTION:    "sqs",
        REDIS_CLIENT:        "phpredis",
        REDIS_HOST:          redisEndpoint,
        REDIS_PORT:          "6379",
        AWS_ACCOUNT_ID:      pulumi.interpolate`${accountId}`,
        AWS_DEFAULT_REGION:  aws.config.requireRegion(),
        SQS_PREFIX:          pulumi.interpolate`https://sqs.${aws.config.region}.amazonaws.com/${accountId}`,
        SQS_QUEUE:           emailQueue,
    };

    if (wsvc.path !== "auth") {
        env["AUTH_SERVICE_JWKS_URL"] = pulumi.interpolate`http://auth-service.${stack}.local/auth/v1/.well-known/jwks.json`;
    }

    const secrets: Record<string, aws.secretsmanager.Secret> = {
        APP_KEY: appKeySecret,
    };

    makeWorkerFargate({
        svc: {
            name:    wsvc.name,
            imageRepo:   wsvc.imageRepo,
            imageTag:   imageTag,
            command: wsvc.command,
        },
        clusterArn: cluster.arn,
        sgIds:      [sgTasksId],
        subnets:    privateSubnetIds,
        taskRole,
        env,
        secrets,
    });
});

frontendServices.forEach((svc, idx) => {
    const imageTag = config.require(`${svc.name}.imageTag`);

    const hostHeaders = svc.supportedTenants.map((t) => t.subdomain);
    const frontendTg = createFrontendTgAndRule({
        albArn:      frontendAlbArn,
        listenerArn: frontendlistenerArn,
        svc:         { name: svc.name, port: svc.port },
        vpcId:       vpcId,
        priority:    10 + idx,
        hostHeaders,
    });

    const taskRole = createEcsTaskRole({
        name:     `${stack}-${svc.name}`,
        policies: svc.policies || [],
    });

    const env: Record<string, pulumi.Input<string>> = {
        NODE_ENV:                      "staging",
        NEXT_PUBLIC_BASE_URL:          `https://${svc.supportedTenants[0].subdomain}`,
        NEXT_PUBLIC_PROJECT_NAME:      "Admin Panel",
        PORT:                          svc.port.toString(),
        API_ENDPOINT:                  "https://stg.valornetvets.com",
        SUPPORTED_TENANTS:             JSON.stringify(svc.supportedTenants.map((t) => t.tenant)),
        TENANT:                        "demo"
    };

    const secrets: Record<string, any> = {
        CLIENTS_LIST: generalSecret,
    };

    svc.supportedTenants.forEach((t) => {
        secrets[`${t.tenant.toUpperCase()}_CONFIG`] = getTenantSecret(stack, t.tenant);
    });

    makeHttpFargate({
        svc: {
            name:         svc.name,
            imageRepo:    svc.imageRepo,
            imageTag:     imageTag,
            port:         svc.port,
        },
        clusterArn:    cluster.arn,
        tg:            frontendTg,
        sgIds:         [sgFrontendId],
        subnets:       publicSubnetIds,
        taskRole,
        env,
        secrets,
        assignPublicIp: true,
    });
});

export function getExports() {
    return {
        services: true
    };
}