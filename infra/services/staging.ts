// infra/services/staging.ts
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { frontendServices, goServices, lambdaServices, laravelServices, servicesInitialConfig, workerServices } from "../servicesConfig";
import { createFrontendTgAndRule, createTgAndRule } from "../shared/alb";
import { createEcrRepo } from "../shared/ecr";
import { createEcsTaskRole, createSdService, makeHttpFargate, makeWorkerFargate } from "../shared/ecs";
import { makeLambdaService } from "../shared/lambda";
import {
    ensureTextSecret,
    getKeyFromSecretsOrFile
} from "../shared/secrets";

/* Config -------------------------------------------------- */
const stack                     = pulumi.getStack();
const core                      = new pulumi.StackReference("organization/infra/staging-core");
const config                    = new pulumi.Config("valornet-infra");
const vpcId                     = core.getOutput("vpcId");
const privateSubnetIds          = core.getOutput("privateSubnetIds");
const publicSubnetIds           = core.getOutput("publicSubnetIds");
const sgTasksId                 = core.getOutput("sgTasksId");
const sgFrontendId              = core.getOutput("sgFrontendId");
const listenerArn               = core.getOutput("listenerArn");
const albArn                    = core.getOutput("albArn");
const frontendAlbArn            = core.getOutput("frontendAlbArn");
const redisEndpoint             = core.getOutput("redisEndpoint");
const emailQueue                = core.getOutput("emailQueue");
const pdfQueue                  = core.getOutput("pdfQueue");
const notificationsQueue        = core.getOutput("notificationsQueue");
const generalSecretArn          = core.getOutput("generalSecretArn");
const frontendlistenerArn       = core.getOutput("frontendlistenerArn");
const frontendHttpListenerArn   = core.getOutput("frontendHttpsListenerArn");
const privDnsNsId               = core.getOutput("privDnsNsId");
    
const rdsEndpoint               = core.getOutput("rdsEndpoint");
const rdsPort                   = core.getOutput("rdsPort");
const rdsUsername               = core.getOutput("rdsUsername");
const rdsPassword               = core.getOutput("rdsPassword");
    
const generalSecret             = pulumi.output(generalSecretArn).apply(arn => aws.secretsmanager.Secret.get("general-secret", arn));
const caller                    = aws.getCallerIdentity({});
const accountId                 = caller.then(c => c.accountId);

/* ECS Cluster -------------------------------------------------- */
const cluster = new aws.ecs.Cluster(`${stack}-cluster`, {
    name: `${stack}-cluster`,
});

/* ECR repos -------------------------------------------------- */
const repoUrls: Record<string, pulumi.Output<string>> = {};

for (const svc of Object.entries(servicesInitialConfig)) {
    const [_, cfg] = svc;

    if (cfg.repo) {
        const repo = createEcrRepo(`${stack}-${cfg.name}-repo`, stack, cfg);
        repoUrls[cfg.name] = repo.repositoryUrl;
    }

    if( cfg.sidecarRepo) {
        const sidecarRepo = createEcrRepo(`${stack}-${cfg.name}-nginx-repo`, stack, { ...cfg, name: `${cfg.name}-nginx` });
        repoUrls[`${cfg.name}-nginx`] = sidecarRepo.repositoryUrl;
    }
}

const getTgAndTaskRole = (
    svc: { name: string; healthPath?: string, path: string, port: number, policies?: (string | pulumi.Output<string>)[] },
    targetPort: number,
    priorityModifier: number = 0
) => {
    const tg = createTgAndRule({
        albArn: albArn,
        listenerArn: listenerArn,
        svc: { ...svc, port: targetPort },
        vpcId: vpcId,
        priority: 100 + (priorityModifier * 10)
    });

    const taskRole = createEcsTaskRole({
        name:     `${stack}-${svc.name}`,
        policies: svc.policies,
    });

    return { tg, taskRole };
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

laravelServices.forEach((svc, idx) => {

    const imageTag = config.require(`${svc.name}.imageTag`);
    const targetPort = svc.nginxSidecarImageRepo ? 80 : svc.port;

    const { tg, taskRole } = getTgAndTaskRole(svc, targetPort, idx);
    
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
        SQS_EMAIL_QUEUE:     emailQueue,
        SQS_PDF_QUEUE:       pdfQueue,
        AWS_BUCKET:          "valornet-assets",
        TENANT_SECRET_NAME:  "staging-core-secret",
        DB_CONNECTION:       "mysql",
        FILESYSTEM_DISK:     "s3",
        CACHE_STORE:         "file",
    };

    const secrets: Record<string, aws.secretsmanager.Secret> = svc.tech === 'laravel' ? {
        APP_KEY: appKeySecret,
    } : {};

    if (svc.path === "auth") {
        secrets.OAUTH_PRIVATE_KEY = jwtPrivSecret;
        secrets.OAUTH_PUBLIC_KEY = jwtPubSecret;
        env.APP_SECRET = "test-app-secret"
    }

    if(svc.path !== 'auth'){
        const firstPartOfStack = stack.split('-')[0];
        env.AUTH_SERVICE_JWKS_URL = pulumi.interpolate`http://auth-service.${firstPartOfStack}-core.local/auth/v1/.well-known/jwks.json`
    }

    if(svc.path === 'telemedicine'){
        const firstPartOfStack = stack.split('-')[0];
        env.USERS_SERVICE_URL = pulumi.interpolate`http://users-service.${firstPartOfStack}-core.local/users/v1`;
    }

    if(svc.path === 'call-request'){
        env.SQS_NOTIFICATIONS_QUEUE = notificationsQueue;
    }

    const serviceDiscovery = svc.path === 'auth' || svc.path === 'users' ? createSdService(svc.name, privDnsNsId) : undefined

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

goServices.forEach((svc, idx) => {

    const imageTag = config.require(`${svc.name}.imageTag`);
    const targetPort = svc.nginxSidecarImageRepo ? 80 : svc.port;
    const { tg, taskRole } = getTgAndTaskRole(svc, targetPort, (laravelServices.length + idx));
    const jwtSecret = pulumi.secret(process.env.JWT_SECRET || "PMre11FAx149k2Bt3w5bahK+/CYVtDc7qmB5hOvt8H4=");

    const env: Record<string, pulumi.Input<string>> = {
        DATABASE_NAME:       "backoffice",
        DATABASE_HOST:       rdsEndpoint.apply((ep: string) => ep.split(":")[0]),
        DATABASE_PORT:       pulumi.interpolate`${rdsPort}`,
        DATABASE_USER:       rdsUsername,
        DATABASE_PASSWORD:   rdsPassword,
        REDIS_URL:           pulumi.interpolate`${redisEndpoint}:6379`,
        SERVER_PORT:         svc.port.toString(),
        ENVIRONMENT:         "staging",

        AWS_ACCOUNT_ID:      pulumi.interpolate`${accountId}`,
        AWS_DEFAULT_REGION:  aws.config.requireRegion(),
        TENANT_SECRET_NAME:  "staging-core-secret",

        JWT_SECRET:          jwtSecret,
    };

    makeHttpFargate({
        svc: { name: svc.name, imageRepo: svc.imageRepo, imageTag: imageTag, port: svc.port },
        clusterArn: cluster.arn,
        tg,
        sgIds: [sgTasksId],
        subnets: privateSubnetIds,
        taskRole,
        env,
        secrets: {},
        nginxSidecarImageRepo: svc.nginxSidecarImageRepo,
        serviceDiscovery: undefined
    })
});

lambdaServices.forEach((svc, idx) => {

    const imageTag = config.require(`${svc.name}.imageTag`);

    const env: Record<string, pulumi.Input<string>> = {
        ENVIRONMENT:         "staging",
        S3_BUCKET:           "valornet-assets",
        S3_PROCESSED_FOLDER: "/processed",
        S3_ORIGINAL_FOLDER:  "/uploads",
    };

    const role = new aws.iam.Role(`${svc.name}-lambda-role`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
    });

    svc.policies.forEach((policyArn, policyIdx) => {
        new aws.iam.RolePolicyAttachment(`${svc.name}-policy-${policyIdx}`, {
            role: role.name,
            policyArn: policyArn,
        });
    });

    const lambda = makeLambdaService({
        svc: { name: svc.name, imageRepo: svc.imageRepo, imageTag: imageTag },
        memorySize: 1536,
        timeout: 900,
        role,
        env
    });

    if(svc.triggeredBy === 's3'){
        const bucket = aws.s3.Bucket.get("valornet-assets-bucket-ref", "valornet-assets");

        const lambdaPermission = new aws.lambda.Permission(`${svc.name}-s3-permission`, {
            action: "lambda:InvokeFunction",
            function: lambda.name,
            principal: "s3.amazonaws.com",
            sourceArn: bucket.arn,
        });

        new aws.s3.BucketNotification(`${svc.name}-bucket-notification`, {
            bucket: bucket.id,
            lambdaFunctions: [{
                lambdaFunctionArn: lambda.arn,
                events: ["s3:ObjectCreated:*"],
                filterPrefix: "uploads/",
            }]
        }, { dependsOn: [lambdaPermission] });

    }
});

workerServices.forEach((wsvc) => {
    const imageTag = config.require(`${wsvc.name}.imageTag`);

    const taskRole = createEcsTaskRole({
        name:     `${stack}-${wsvc.name}`,
        policies: wsvc.policies,
    });

    const env: Record<string, pulumi.Input<string>> = {
        APP_NAME:                   wsvc.envName,
        APP_ENV:                    "staging",
        APP_DEBUG:                  "false",
        APP_URL:                    "https://stg.valornetvets.com",
        QUEUE_CONNECTION:           "sqs",
        REDIS_CLIENT:               "phpredis",
        REDIS_HOST:                 redisEndpoint,
        REDIS_PORT:                 "6379",
        AWS_ACCOUNT_ID:             pulumi.interpolate`${accountId}`,
        AWS_DEFAULT_REGION:         aws.config.requireRegion(),
        SQS_PREFIX:                 pulumi.interpolate`https://sqs.${aws.config.region}.amazonaws.com/${accountId}`,
        SQS_QUEUE:                  emailQueue,
        SQS_EMAIL_QUEUE:            emailQueue,
        SQS_PDF_QUEUE:              pdfQueue,
        SQS_NOTIFICATIONS_QUEUE:    notificationsQueue,
        MAIL_MAILER:                "ses",
        MAIL_FROM_ADDRESS:          "no-reply@valornetvets.com",
        MAIL_FROM_NAME:             "ValorNet",
        FILESYSTEM_DISK:            "s3",
        DB_CONNECTION:              "mysql",
        CACHE_STORE:                "file"
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
        listenerArn: frontendHttpListenerArn,
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
        TENANT:                        "demo",
        NEXT_PUBLIC_FILES_URL:         "https://valornet-assets.s3.us-east-1.amazonaws.com/uploads"
    };

    if(svc.name === "valornet-backoffice-frontend") {
        env.VITE_API_BASE_URL = "https://stg.valornetvets.com/backoffice/v1";
    }

    const secrets: Record<string, any> = {
        CLIENTS_LIST: generalSecret,
    };

    // svc.supportedTenants.forEach((t) => {
    //     secrets[`${t.tenant.toUpperCase()}_CONFIG`] = getTenantSecret(stack, t.tenant);
    // });

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