import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { frontendServices, httpServices, workerServices } from "../servicesConfig";
import { createTgAndRule } from "../shared/alb";
import { createAlbIntegration, createApiMapping, createDomainName, createHttpApi, createRoute, createStage } from "../shared/apiGateway";
import { createEcrRepo } from "../shared/ecr";
import { createEcsTaskRole, createSdService, makeHttpFargate, makeWorkerFargate } from "../shared/ecs";
import {
    ensureTextSecret,
    getKeyFromSecretsOrFile
} from "../shared/secrets";
import { createVpcLink } from "../shared/vpcLink";

/* Config -------------------------------------------------- */
const stack                 = pulumi.getStack();
const certArn               = "arn:aws:acm:us-east-1:331240720676:certificate/f5811ee2-2f5e-4424-a216-5c2a794e78c3";
const core                  = new pulumi.StackReference("staging-core");
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
const stagingQueueUrl       = core.getOutput("stagingQueueUrl");
const generalSecretArn      = core.getOutput("generalSecretArn");
const privDnsNsId           = core.getOutput("privDnsNsId");
const frontendListenerArn   = core.getOutput("frontendListenerArn");
const generalSecret         = pulumi.output(generalSecretArn).apply(arn => 
    aws.secretsmanager.Secret.get("general-secret", arn)
);
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

const appKeySecret = ensureTextSecret(`${stack}-laravel-app-key`, laravelAppKey);

const privateKey = getKeyFromSecretsOrFile("OAUTH_PRIVATE_KEY", "./.keys/staging/oauth-private.key");
const publicKey = getKeyFromSecretsOrFile("OAUTH_PUBLIC_KEY", "./.keys/staging/oauth-public.key");

const jwtPrivSecret = ensureTextSecret(`${stack}-jwt-private`, privateKey);
const jwtPubSecret = ensureTextSecret(`${stack}-jwt-public`, publicKey);

httpServices.forEach((svc, idx) => {

    const imageTag = config.require(`${svc.name}.imageTag`);
   
    const targetPort = svc.nginxSidecarImageRepo ? 80 : svc.port;
    const tg = createTgAndRule({
        albArn:        albArn.apply(a => a),
        listenerArn:   listenerArn.apply(l => l),
        svc:           { ...svc, port: targetPort },
        vpcId:         vpcId.apply(v => v),
        priority:      10 + idx,
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
        SQS_QUEUE:           stagingQueueUrl,
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

    const serviceDiscovery = svc.path === 'auth' 
        ? (() => {
            console.log(`🔍 Criando Service Discovery para auth service`);
            console.log(`🔍 privDnsNsId:`, privDnsNsId);
            return createSdService(`${stack}-${svc.name}`, privDnsNsId);
          })()
        : undefined;
  
    makeHttpFargate({
        svc: { name: svc.name, imageRepo: svc.imageRepo, imageTag: imageTag, port: svc.port },
        clusterArn:    cluster.arn,
        tg,
        sgIds:         [sgTasksId],
        subnets:       privateSubnetIds,
        taskRole,
        env,
        secrets,
        nginxSidecarImageRepo: svc.nginxSidecarImageRepo,
        serviceDiscovery: serviceDiscovery
    });

    const httpApi = createHttpApi(`${stack}-${svc.name}-api`);
    const vpcLink = createVpcLink(`${stack}-${svc.name}-vpclink`, privateSubnetIds.apply(ids => ids));
    const albInt = pulumi.all([albArn, listenerArn, vpcLink]).apply(([aArn, lArn, vLink]) =>
        createAlbIntegration(`${stack}-${svc.name}-alb-int`, httpApi.id, vLink.id, lArn)
    );

    createRoute(
        `${svc.name}-route`,
        httpApi.id,
        `ANY /${svc.path}/v1/{proxy+}`,
        albInt.apply(i => i.id)
    );
    const stage = createStage("default", httpApi.id, "$default");
    const domain = createDomainName(
        `${svc.name}-domain`,
        `${svc.path}.stg.valornetvets.com`,
        certArn
    );
    createApiMapping(`map-${svc.name}`, httpApi.id, domain.id, stage.name, "");
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
        SQS_QUEUE:           stagingQueueUrl,
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

// frontendServices.forEach((svc, idx) => {
//     const imageTag = config.require(`${svc.name}.imageTag`);

//     const hostHeaders = svc.supportedTenants.map((t) => t.subdomain);
//     const frontendTg = createFrontendTgAndRule({
//         albArn:      frontendAlbArn.apply(a => a),
//         listenerArn: frontendListenerArn.apply(l => l),
//         svc:         { name: svc.name, port: svc.port },
//         vpcId:       vpcId.apply(v => v),
//         priority:    10 + idx,
//         hostHeaders,
//     });

//     const taskRole = createEcsTaskRole({
//         name:     `${stack}-${svc.name}`,
//         policies: svc.policies || [],
//     });

//     const env: Record<string, pulumi.Input<string>> = {
//         NODE_ENV:          "staging",
//         PORT:              svc.port.toString(),
//         API_ENDPOINT:      "https://stg.valornetvets.com",
//         SUPPORTED_TENANTS: JSON.stringify(svc.supportedTenants.map((t) => t.tenant)),
//     };

//     const secrets: Record<string, any> = {
//         CLIENTS_LIST: generalSecret,
//     };

//     svc.supportedTenants.forEach((t) => {
//         secrets[`${t.tenant.toUpperCase()}_CONFIG`] = getTenantSecret(stack, t.tenant);
//     });

//     makeHttpFargate({
//         svc: {
//             name:         svc.name,
//             imageRepo:    svc.imageRepo,
//             imageTag:     imageTag,
//             port:         svc.port,
//         },
//         clusterArn:    cluster.arn,
//         tg:            frontendTg,
//         sgIds:         [sgFrontendId],
//         subnets:       publicSubnetIds,
//         taskRole,
//         env,
//         secrets,
//         assignPublicIp: true,
//     });
// });