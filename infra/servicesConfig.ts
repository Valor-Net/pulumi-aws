import * as aws from '@pulumi/aws';
import { Input, Output } from "@pulumi/pulumi";

export type Policies = (string | Output<string>)[];

export interface Svc {
    name: string;
    envName: string;
    imageRepo: string;
    nginxSidecarImageRepo?: string;
}

export interface LambdaSvc extends Svc {
    policies: Policies;
    triggeredBy?: string;
}

export interface HttpSvc extends Svc {
    path: string;
    port: number;
    tech: string;
    policies?: Policies;
    healthPath?: string;
}
  
export interface WorkerSvc extends Svc {
    path: string;
    command: Input<string>[];
    policies?: string[];
    cpu?: number;
    memory?: number;
}


export interface TenantConfig {
    tenant: string;
    subdomain: string;
    customSettings: Record<string, any>;
}

export interface FrontendSvc {
    name: string;
    envName: string;
    imageRepo: string;
    nginxSidecarImageRepo?: string;
    port: number;
    tech: string;
    healthPath: string;
    policies?: Policies
    supportedTenants: TenantConfig[];
}

export interface ServiceInitialConfig {
    name: string;
    envName: string;
    repo: string;
    sidecarRepo?: string;
}

const servicesInitialConfig: Record<string, ServiceInitialConfig> = {
    auth: {
        name: "auth-service",
        envName: "AuthService",
        repo:"staging-services-auth-service-repo",
        sidecarRepo: "staging-services-auth-service-nginx-repo",
    },
    backoffice: {
        name: "backoffice-service",
        envName: "BackofficeService",
        repo:"staging-services-backoffice-service-repo",
    },
    emailService: {
        name: "email-service",
        envName: "EmailWorker",
        repo:"staging-services-email-service-repo",
    },
    valornetFrontend: {
        name: "valornet-frontend",
        envName: "ValornetFrontend",
        repo: "staging-services-valornet-frontend-repo",
    },
    backofficeFrontend: {
        name: "valornet-backoffice-frontend",
        envName: "ValornetBackofficeFrontend",
        repo: "staging-services-valornet-backoffice-frontend-repo",
    },
    fileProcessorLambdaService: {
        name: "file-processor-lambda-service",
        envName: "FileProcessorLambdaService",
        repo: "staging-services-file-processor-lambda-service-repo",
    },
    users: {
        name: "users-service",
        envName: "UsersService",
        repo:"staging-services-users-service-repo",
        sidecarRepo: "staging-services-users-service-nginx-repo",
    },
    brainGames: {
        name: "brain-games-service",
        envName: "BrainGamesService",
        repo:"staging-services-brain-games-service-repo",
        sidecarRepo: "staging-services-brain-games-service-nginx-repo",
    },
    books: {
        name: "books-service",
        envName: "BooksService",
        repo:"staging-services-books-service-repo",
        sidecarRepo: "staging-services-books-service-nginx-repo",
    },
    nutritional: {
        name: "nutritional-service",
        envName: "NutritionalService",
        repo:"staging-services-nutritional-service-repo",
        sidecarRepo: "staging-services-nutritional-service-nginx-repo",
    },
    resourceCenter: {
        name: "resource-center-service",
        envName: "ResourceCenterService",
        repo:"staging-services-resource-center-service-repo",
        sidecarRepo: "staging-services-resource-center-service-nginx-repo",
    },
    relaxingSounds: {
        name: "relaxing-sounds-service",
        envName: "RelaxingSoundsService",
        repo:"staging-services-relaxing-sounds-service-repo",
        sidecarRepo: "staging-services-relaxing-sounds-service-nginx-repo",
    },
}

/* EDITAR AQUI quando nascer novo frontend */
const frontendServices: FrontendSvc[] = [
    {
        name: servicesInitialConfig.valornetFrontend.name,
        envName: servicesInitialConfig.valornetFrontend.envName, 
        imageRepo: servicesInitialConfig.valornetFrontend.repo,
        port: 3000,
        tech: "nextjs",
        healthPath: "/api/health",
        policies: [
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        ],
        supportedTenants: [
            {
                tenant: "demo",
                subdomain: "stg-demo.valornetvets.com",
                customSettings: {
                    theme: "default-theme",
                }
            },
        ]
    },
    {
        name: servicesInitialConfig.backofficeFrontend.name,
        envName: servicesInitialConfig.backofficeFrontend.envName, 
        imageRepo: servicesInitialConfig.backofficeFrontend.repo,
        port: 80,
        tech: "react",
        healthPath: "/_health",
        policies: [
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        ],
        supportedTenants: [
            {
                tenant: "backoffice",
                subdomain: "backoffice.valornetvets.com",
                customSettings: {
                    theme: "default-theme",
                }
            },
        ]
    },
];


/* EDITAR AQUI quando nascer novo serviço */
const laravelServices: HttpSvc[] = [
    {
        name: servicesInitialConfig.auth.name,
        envName: servicesInitialConfig.auth.envName,
        path: "auth",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.auth.repo,
        nginxSidecarImageRepo: servicesInitialConfig.auth.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        ]
    },
    {
        name: servicesInitialConfig.users.name,
        envName: servicesInitialConfig.users.envName,
        path: "users",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.users.repo,
        nginxSidecarImageRepo: servicesInitialConfig.users.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess
        ]
    },
    {
        name: servicesInitialConfig.brainGames.name,
        envName: servicesInitialConfig.brainGames.envName,
        path: "brain-games",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.brainGames.repo,
        nginxSidecarImageRepo: servicesInitialConfig.brainGames.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess
        ]
    },
    {
        name: servicesInitialConfig.books.name,
        envName: servicesInitialConfig.books.envName,
        path: "books",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.books.repo,
        nginxSidecarImageRepo: servicesInitialConfig.books.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess
        ]
    },
    {
        name: servicesInitialConfig.nutritional.name,
        envName: servicesInitialConfig.nutritional.envName,
        path: "nutritional",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.nutritional.repo,
        nginxSidecarImageRepo: servicesInitialConfig.nutritional.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess
        ]
    },
    {
        name: servicesInitialConfig.resourceCenter.name,
        envName: servicesInitialConfig.resourceCenter.envName,
        path: "resource-center",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.resourceCenter.repo,
        nginxSidecarImageRepo: servicesInitialConfig.resourceCenter.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess
        ]
    },
    {
        name: servicesInitialConfig.relaxingSounds.name,
        envName: servicesInitialConfig.relaxingSounds.envName,
        path: "relaxing-sounds",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.relaxingSounds.repo,
        nginxSidecarImageRepo: servicesInitialConfig.relaxingSounds.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess
        ]
    }
]

const goServices: HttpSvc[] = [
    {
        name: servicesInitialConfig.backoffice.name,
        envName: servicesInitialConfig.backoffice.envName,
        path: "backoffice",
        healthPath: "/_health",
        port: 8080,
        imageRepo: servicesInitialConfig.backoffice.repo,
        tech: "go",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        ]
    },
]

const lambdaServices: LambdaSvc[] = [
    {
        name: servicesInitialConfig.fileProcessorLambdaService.name,
        envName: servicesInitialConfig.fileProcessorLambdaService.envName,
        imageRepo: servicesInitialConfig.fileProcessorLambdaService.repo,
        policies: [
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
        ],
        triggeredBy: "s3",
    }
]
  
const workerServices: WorkerSvc[] = [
    {
        name: servicesInitialConfig.emailService.name,
        envName: servicesInitialConfig.emailService.envName,
        path: "email",
        imageRepo: servicesInitialConfig.emailService.repo,
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonSESFullAccess,
        ],
        command: ["php", "artisan", "sqs:consume-email"]
    },
];

export { frontendServices, goServices, lambdaServices, laravelServices, servicesInitialConfig, workerServices };
  