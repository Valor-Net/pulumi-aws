// customers/quest/quest-staging/index.ts (ou quest-production)
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { createFrontendTgAndRule, createTgAndRule } from "./shared/alb";
import { createRoute } from "./shared/apiGateway";
import { resolveConfig, resolveCoreConfig } from "./shared/configResolver";
import { createEcsTaskRole, createSdService, makeHttpFargate, makeWorkerFargate } from "./shared/ecs";
import { makeLambdaService } from "./shared/lambda";
import { ensureTextSecret, getKeyFromSecretsOrFile } from "./shared/secrets";

/* Config & Stack References ------------------------------------------------ */
const stack = pulumi.getStack();
const stackParts = stack.split("-");
const customer = stackParts[0];
const environment = stackParts[1]; 
const envReduced = environment == 'production' ? 'prd' : 'stg';

// Stack references
const baseCore = new pulumi.StackReference("organization/infra/base-core");
const questCore = new pulumi.StackReference(`organization/infra/${customer}-core`);

// Resolve service config
const config = resolveConfig({
    basePath: "configs/base.json",
    customerPath: `configs/customers/${customer}/${customer}.${environment}.json`,
});

const configCore = resolveCoreConfig(`configs/customers/${customer}/${customer}.core.json`);


console.log(`🚀 Deploying ${config.customer} - ${config.environment} services`);
console.log(`   HTTP Services: ${config.http.length}`);
console.log(`   Worker Services: ${config.worker.length}`);
console.log(`   Lambda Services: ${config.lambda.length}`);
console.log(`   Frontend Services: ${config.frontend.length}`);


// Get quest-core outputs (environment-specific)
const envConfig = questCore.requireOutput(environment);
const vpcId = questCore.getOutput("vpcId");
const privateSubnetIds = questCore.getOutput("privateSubnetIds");
const publicSubnetIds = questCore.getOutput("publicSubnetIds");
const sgTasksId = questCore.getOutput("sgTasksId");
const sgFrontendId = questCore.getOutput("sgFrontendId");
const privDnsNsId = questCore.getOutput("privDnsNsId");

// Environment-specific resources
const backendListenerArn = envConfig.apply((config: any) => config.backendListenerArn);
const backendAlbArn = envConfig.apply((config: any) => config.backendAlbArn);
const frontendHttpsListenerArn = envConfig.apply((config: any) => config.frontendHttpsListenerArn);
const frontendAlbArn = envConfig.apply((config: any) => config.frontendAlbArn);

const rdsEndpoint = envConfig.apply((config: any) => config.rdsEndpoint);
const rdsPort = envConfig.apply((config: any) => config.rdsPort);
const rdsUsername = envConfig.apply((config: any) => config.rdsUsername);
const rdsPassword = envConfig.apply((config: any) => config.rdsPassword);
const rdsDbName = envConfig.apply((config: any) => config.rdsDbName);

const redisEndpoint = envConfig.apply((config: any) => config.redisEndpoint);

const emailQueue = envConfig.apply((config: any) => config.emailQueue);
const pdfQueue = envConfig.apply((config: any) => config.pdfQueue);
const notificationsQueue = envConfig.apply((config: any) => config.notificationsQueue);

const apiGatewayId = envConfig.apply((config: any) => config.apiGatewayId);
const albIntegrationId = envConfig.apply((config: any) => config.albIntegrationId);

const bucketId = envConfig.apply((config: any) => config.bucket);

const caller = aws.getCallerIdentity({});
const accountId = caller.then(c => c.accountId);

/* ECS Cluster -------------------------------------------------- */
const cluster = new aws.ecs.Cluster(`${stack}-cluster`, {
    name: `${stack}-cluster`,
});

/* Shared Secrets (Laravel APP_KEY, OAuth Keys) ---------------- */
const laravelAppKey = new random.RandomPassword(`${stack}-app-key`, {
    length: 32,
    special: false,
    overrideSpecial: "_-",
}).result.apply(p => Buffer.from(p, "utf8").toString("base64"));

const appKeySecret = ensureTextSecret(`${stack}-app-key`, laravelAppKey);

const privateKey = getKeyFromSecretsOrFile("OAUTH_PRIVATE_KEY", `./.keys/${environment}/oauth-private.key`);
const publicKey = getKeyFromSecretsOrFile("OAUTH_PUBLIC_KEY", `./.keys/${environment}/oauth-public.key`);

const jwtPrivSecret = ensureTextSecret(`${stack}-private-key`, privateKey);
const jwtPubSecret = ensureTextSecret(`${stack}-public-key`, publicKey);

/* HTTP Services (Laravel, Go, etc) ----------------------------- */
config.http.forEach((svc, idx) => {
    console.log(`📦 Deploying HTTP service: ${svc.name}`);

    const svcNameArr = svc.name.split('-');
    const svcNameReduced = `${svcNameArr[0]}-svc`;
    const smallSvcName = `${svcNameArr[0].substring(0, 5)}-svc`;
    let tgName = `${customer}-${envReduced}-${svcNameReduced}-tg`;
    let ruleName = `${customer}-${envReduced}-${svcNameReduced}-rl`;

    if(tgName.length > 32){
        tgName = `${customer}-${envReduced}-${smallSvcName}-tg`;
    }

    if(tgName.length > 32){
        ruleName = `${customer}-${envReduced}-${smallSvcName}-rl`;
    }

    // Create target group and ALB rule
    const targetPort = svc.nginxSidecar ? 80 : svc.port;
    const tg = createTgAndRule({
        tgName,
        ruleName,
        albArn: backendAlbArn,
        listenerArn: backendListenerArn,
        svc: {
            path: svc.path,
            port: targetPort,
            healthPath: svc.healthPath,
        },
        vpcId: vpcId,
        priority: 100 + (idx * 10),
    });

    // Create IAM role with resolved policies
    const taskRole = createEcsTaskRole({
        name: `${stack}-${svc.name}`,
        policies: svc.policies,
    });

    // Build environment variables
    const env: Record<string, pulumi.Input<string>> = {
        ...svc.ecs.env, // Global + service-specific env from config
        APP_NAME: svc.name,
        APP_ENV: environment,
        AWS_ACCOUNT_ID: pulumi.interpolate`${accountId}`,
        AWS_DEFAULT_REGION: aws.config.requireRegion(),
    };

    // Tech-specific env vars
    if (svc.tech === "laravel") {
        Object.assign(env, {
            APP_DEBUG: environment === "staging" ? "true" : "false",
            APP_URL: `https://${configCore.apiGateway[environment as "staging" | "production"].domain}`,
            QUEUE_CONNECTION: "sqs",
            REDIS_CLIENT: "phpredis",
            REDIS_HOST: redisEndpoint,
            REDIS_PORT: "6379",
            SQS_PREFIX: pulumi.interpolate`https://sqs.${aws.config.region}.amazonaws.com/${accountId}`,
            SQS_QUEUE: emailQueue,
            SQS_EMAIL_QUEUE: emailQueue,
            SQS_NOTIFICATIONS_QUEUE: notificationsQueue,
            SQS_PDF_QUEUE: pdfQueue,
            AWS_BUCKET: bucketId,
            TENANT_SECRET_NAME: `${customer}-core-secret`,
            DB_CONNECTION: "mysql",
            FILESYSTEM_DISK: "s3",
            CACHE_STORE: "file",
        });
    } else if (svc.tech === "go") {
        Object.assign(env, {
            DATABASE_NAME: rdsDbName,
            DATABASE_HOST: rdsEndpoint.apply((ep: string) => ep.split(":")[0]),
            DATABASE_PORT: pulumi.interpolate`${rdsPort}`,
            DATABASE_USER: rdsUsername,
            DATABASE_PASSWORD: rdsPassword,
            REDIS_URL: pulumi.interpolate`${redisEndpoint}:6379`,
            SERVER_PORT: svc.port.toString(),
            ENVIRONMENT: environment,
            TENANT_SECRET_NAME: `${stack}-secret`,
            JWT_SECRET: pulumi.secret(process.env.JWT_SECRET || "default-jwt-secret"),
        });
    }

    // Build secrets
    const secrets: Record<string, aws.secretsmanager.Secret> = {};
    if (svc.tech === "laravel") {
        secrets.APP_KEY = appKeySecret;
    }

    // Auth service specific secrets
    if (svc.path === "auth") {
        secrets.OAUTH_PRIVATE_KEY = jwtPrivSecret;
        secrets.OAUTH_PUBLIC_KEY = jwtPubSecret;
        env.APP_SECRET = "test-app-secret"; // TODO: Move to config
    }

    // Inter-service communication URLs
    if (svc.path !== "auth") {
        const dnsNamespace = questCore.getOutput("privDnsNamespace");
        env.AUTH_SERVICE_JWKS_URL = pulumi.interpolate`http://auth-service.${dnsNamespace}/auth/v1/.well-known/jwks.json`;
    }

    if (svc.path === "telemedicine") {
        const dnsNamespace = questCore.getOutput("privDnsNamespace");
        env.USERS_SERVICE_URL = pulumi.interpolate`http://users-service.${dnsNamespace}/users/v1`;
    }

    // Service Discovery (for auth and users)
    const serviceDiscovery = (svc.path === "auth" || svc.path === "users")
        ? createSdService(`${stack}-${svcNameReduced}-sd`, privDnsNsId)
        : undefined;

    // Get ECR repo URL
    const imageRepoUrl = svc.imageRepo;
    const nginxSidecarRepoUrl = svc.nginxSidecarImageRepo;

    // Deploy service
    makeHttpFargate({
        svc: {
            name: svc.name,
            imageRepo: imageRepoUrl,
            imageTag: svc.imageTag || "latest",
            port: svc.port,
            cpu: svc.ecs.cpu,
            memory: svc.ecs.memory,
        },
        clusterArn: cluster.arn,
        tg,
        sgIds: [sgTasksId],
        subnets: privateSubnetIds,
        taskRole,
        env,
        secrets,
        nginxSidecarImageRepo: nginxSidecarRepoUrl,
        serviceDiscovery,
    });

    // Create API Gateway route
    createRoute(
        `${svc.name}-route`,
        apiGatewayId,
        `ANY /${svc.path}/v1/{proxy+}`,
        albIntegrationId
    );
});

/* Worker Services ------------------------------------------- */
config.worker.forEach((wsvc) => {
    console.log(`⚙️  Deploying Worker service: ${wsvc.name}`);

    const taskRole = createEcsTaskRole({
        name: `${stack}-${wsvc.name}`,
        policies: wsvc.policies,
    });

    const env: Record<string, pulumi.Input<string>> = {
        ...wsvc.ecs.env,
        APP_NAME: wsvc.name,
        APP_ENV: environment,
        APP_DEBUG: environment === "staging" ? "true" : "false",
        APP_URL: `https://${configCore.apiGateway[environment as "staging" | "production"].domain}`,
        QUEUE_CONNECTION: "sqs",
        REDIS_CLIENT: "phpredis",
        REDIS_HOST: redisEndpoint,
        REDIS_PORT: "6379",
        AWS_ACCOUNT_ID: pulumi.interpolate`${accountId}`,
        AWS_DEFAULT_REGION: aws.config.requireRegion(),
        AWS_BUCKET: bucketId,
        SQS_PREFIX: pulumi.interpolate`https://sqs.${aws.config.region}.amazonaws.com/${accountId}`,
        SQS_QUEUE: emailQueue,
        SQS_EMAIL_QUEUE: emailQueue,
        SQS_PDF_QUEUE: pdfQueue,
        SQS_NOTIFICATIONS_QUEUE: notificationsQueue,
        MAIL_MAILER: "ses",
        MAIL_FROM_ADDRESS: "no-reply@valornetvets.com",
        MAIL_FROM_NAME: "ValorNet",
        FILESYSTEM_DISK: "s3",
        DB_CONNECTION: "mysql",
        CACHE_STORE: "file",
    };

    const secrets: Record<string, aws.secretsmanager.Secret> = {
        APP_KEY: appKeySecret,
    };

    const imageRepoUrl = wsvc.imageRepo

    makeWorkerFargate({
        svc: {
            name: wsvc.name,
            imageRepo: imageRepoUrl,
            imageTag: wsvc.imageTag || "latest",
            command: wsvc.command || ["php", "artisan", "queue:work"],
            cpu: wsvc.ecs.cpu,
            memory: wsvc.ecs.memory,

        },
        clusterArn: cluster.arn,
        sgIds: [sgTasksId],
        subnets: privateSubnetIds,
        taskRole,
        env,
        secrets,
    });
});

/* Lambda Services ------------------------------------------- */
config.lambda.forEach((lsvc) => {
    console.log(`λ Deploying Lambda service: ${lsvc.name}`);

    const env: Record<string, pulumi.Input<string>> = {
        ...lsvc.ecs.env,
        ENVIRONMENT: environment,
        S3_BUCKET: bucketId,
        S3_PROCESSED_FOLDER: "/processed",
        S3_ORIGINAL_FOLDER: "/uploads",
    };

    const role = new aws.iam.Role(`${stack}-${lsvc.name}-role`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
    });

    lsvc.policies.forEach((policyArn, policyIdx) => {
        new aws.iam.RolePolicyAttachment(`${stack}-${lsvc.name}-policy-${policyIdx}`, {
            role: role.name,
            policyArn: policyArn,
        });
    });

    const imageRepoUrl = lsvc.imageRepo

    const lambda = makeLambdaService({
        svc: {
            name: `${stack}-${lsvc.name}`,
            imageRepo: imageRepoUrl,
            imageTag: lsvc.imageTag || "latest",
        },
        memorySize: lsvc.ecs.memory,
        timeout: 900,
        role,
        env,
    });

    // S3 trigger (if configured)
    if (lsvc.triggeredBy.includes("s3")) {
        const bucket = aws.s3.Bucket.get(`${bucketId}-bucket-ref`, bucketId);

        const lambdaPermission = new aws.lambda.Permission(`${stack}-${lsvc.name}-s3-permission`, {
            action: "lambda:InvokeFunction",
            function: lambda.name,
            principal: "s3.amazonaws.com",
            sourceArn: bucket.arn,
        });

        new aws.s3.BucketNotification(`${stack}-${lsvc.name}-bucket-notification`, {
            bucket: bucket.id,
            lambdaFunctions: [{
                lambdaFunctionArn: lambda.arn,
                events: ["s3:ObjectCreated:*"],
                filterPrefix: "uploads/",
            }]
        }, { dependsOn: [lambdaPermission] });
    }

    // SQS trigger (if configured)
    if (lsvc.triggeredBy.includes("sqs")) {
        // TODO: Implement SQS event source mapping
        console.warn(`⚠️  SQS trigger for ${lsvc.name} not yet implemented`);
    }
});

/* Frontend Services ----------------------------------------- */
config.frontend.forEach((fsvc, idx) => {
    console.log(`🌐 Deploying Frontend service: ${fsvc.name}`);

    const hostHeaders = [configCore.domain]

    const svcNameArr = fsvc.name.split('-');
    const svcNameReduced = `${svcNameArr[0]}-svc`;
    const smallSvcName = `${svcNameArr[0].substring(0, 5)}-svc`;
    let tgName = `${customer}-${envReduced}-${svcNameReduced}-tg`;
    let ruleName = `${customer}-${envReduced}-${svcNameReduced}-rl`;

    if(tgName.length > 32){
        tgName = `${customer}-${envReduced}-${smallSvcName}-tg`;
    }

    if(tgName.length > 32){
        ruleName = `${customer}-${envReduced}-${smallSvcName}-rl`;
    }
    
    const frontendTg = createFrontendTgAndRule({
        tgName,
        ruleName,
        albArn: frontendAlbArn,
        listenerArn: frontendHttpsListenerArn,
        svc: { name: fsvc.name, port: fsvc.port },
        vpcId: vpcId,
        priority: 5 + idx,
        hostHeaders,
    });

    const taskRole = createEcsTaskRole({
        name: `${stack}-${fsvc.name}`,
        policies: fsvc.policies || [],
    });

    const env: Record<string, pulumi.Input<string>> = {
        ...fsvc.ecs.env,
        ...(fsvc.env || {}), // Service-specific env from config
        NODE_ENV: environment,
        PORT: fsvc.port.toString(),
        API_ENDPOINT: `https://${configCore.apiGateway[environment as "staging" | "production"].domain}`,
        SUPPORTED_TENANTS: JSON.stringify((fsvc.tenants || []).map((t) => t.tenant)),
        TENANT: customer,
        NEXT_PUBLIC_FILES_URL: `https://${bucketId}.s3.us-east-1.amazonaws.com/uploads`,
    };

    // Frontend-specific overrides
    if (fsvc.tenants && fsvc.tenants.length > 0) {
        env.NEXT_PUBLIC_BASE_URL = `https://${fsvc.tenants[0].subdomain}/`;
    }

    if (fsvc.name === "valornet-backoffice-frontend") {
        env.VITE_API_BASE_URL = `https://${environment === "staging" ? "stg" : "api"}.${customer}.valornetvets.com/backoffice/v1`;
    }

    

    const imageRepoUrl = fsvc.imageRepo

    makeHttpFargate({
        svc: {
            name: fsvc.name,
            imageRepo: imageRepoUrl,
            imageTag: fsvc.imageTag || "latest",
            port: fsvc.port,
            cpu: fsvc.ecs.cpu,
            memory: fsvc.ecs.memory,
        },
        clusterArn: cluster.arn,
        tg: frontendTg,
        sgIds: [sgFrontendId],
        subnets: publicSubnetIds,
        taskRole,
        env,
        assignPublicIp: true,
    });
});

/* Outputs -------------------------------------------------------- */
export function getExports() {
    return {
        customer: config.customer,
        environment: config.environment,
        clusterArn: cluster.arn,
        servicesDeployed: {
            http: config.http.map(s => s.name),
            worker: config.worker.map(s => s.name),
            lambda: config.lambda.map(s => s.name),
            frontend: config.frontend.map(s => s.name),
        },
    };
}