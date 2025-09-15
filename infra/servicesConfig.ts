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

    spiritual: {
        name: "spiritual-service",
        envName: "SpiritualService",
        repo:"staging-services-spiritual-service-repo",
        sidecarRepo: "staging-services-spiritual-service-nginx-repo",
    },
    mental: {
        name: "mental-service",
        envName: "MentalService",
        repo:"staging-services-mental-service-repo",
        sidecarRepo: "staging-services-mental-service-nginx-repo",
    },
    specialtyCare: {
        name: "specialty-care-service",
        envName: "SpecialtyCareService",
        repo:"staging-services-specialty-care-service-repo",
        sidecarRepo: "staging-services-specialty-care-service-nginx-repo",
    },
    landingPages: {
        name: "landing-pages-service",
        envName: "LandingPagesService",
        repo:"staging-services-landing-pages-service-repo",
        sidecarRepo: "staging-services-landing-pages-service-nginx-repo",
    },
    podcasts: {
        name: "podcasts-service",
        envName: "PodcastsService",
        repo:"staging-services-podcasts-service-repo",
        sidecarRepo: "staging-services-podcasts-service-nginx-repo",
    },
    workouts: {
        name: "workouts-service",
        envName: "WorkoutsService",
        repo:"staging-services-workouts-service-repo",
        sidecarRepo: "staging-services-workouts-service-nginx-repo",
    },
    meditations: {
        name: "meditations-service",
        envName: "MeditationsService",
        repo:"staging-services-meditations-service-repo",
        sidecarRepo: "staging-services-meditations-service-nginx-repo",
    },
    sleep: {
        name: "sleep-service",
        envName: "SleepService",
        repo:"staging-services-sleep-service-repo",
        sidecarRepo: "staging-services-sleep-service-nginx-repo",
    },
    readinessContents: {
        name: "readiness-contents-service",
        envName: "ReadinessContentsService",
        repo:"staging-services-readiness-contents-service-repo",
        sidecarRepo: "staging-services-readiness-contents-service-nginx-repo",
    },
    chat: {
        name: "chat-service",
        envName: "ChatService",
        repo:"staging-services-chat-service-repo",
        sidecarRepo: "staging-services-chat-service-nginx-repo",
    },
    classes: {
        name: "classes-service",
        envName: "ClassesService",
        repo:"staging-services-classes-service-repo",
        sidecarRepo: "staging-services-classes-service-nginx-repo",
    },
    pdfGeneratorService: {
        name: "pdf-generator-service",
        envName: "PdfGeneratorWorker",
        repo:"staging-services-pdf-generator-service-repo",
    },
    notifications: {
        name: "notifications-service",
        envName: "NotificationsWorker",
        repo:"staging-services-notifications-service-repo",
    },
    callRequest: {
        name: "call-request-service",
        envName: "CallRequestService",
        repo:"staging-services-call-request-service-repo",
        sidecarRepo: "staging-services-call-request-service-nginx-repo",
    },
    telemedicine: {
        name: "telemedicine-service",
        envName: "TelemedicineService",
        repo:"staging-services-telemedicine-service-repo",
        sidecarRepo: "staging-services-telemedicine-service-nginx-repo",
    }
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
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

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
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

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
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

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
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

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
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

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
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },

    {
        name: servicesInitialConfig.spiritual.name,
        envName: servicesInitialConfig.spiritual.envName,
        path: "spiritual",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.spiritual.repo,
        nginxSidecarImageRepo: servicesInitialConfig.spiritual.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.mental.name,
        envName: servicesInitialConfig.mental.envName,
        path: "mental",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.mental.repo,
        nginxSidecarImageRepo: servicesInitialConfig.mental.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.specialtyCare.name,
        envName: servicesInitialConfig.specialtyCare.envName,
        path: "specialty-care",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.specialtyCare.repo,
        nginxSidecarImageRepo: servicesInitialConfig.specialtyCare.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.landingPages.name,
        envName: servicesInitialConfig.landingPages.envName,
        path: "landing-pages",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.landingPages.repo,
        nginxSidecarImageRepo: servicesInitialConfig.landingPages.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.podcasts.name,
        envName: servicesInitialConfig.podcasts.envName,
        path: "podcasts",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.podcasts.repo,
        nginxSidecarImageRepo: servicesInitialConfig.podcasts.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.workouts.name,
        envName: servicesInitialConfig.workouts.envName,
        path: "workouts",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.workouts.repo,
        nginxSidecarImageRepo: servicesInitialConfig.workouts.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.meditations.name,
        envName: servicesInitialConfig.meditations.envName,
        path: "meditations",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.meditations.repo,
        nginxSidecarImageRepo: servicesInitialConfig.meditations.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.sleep.name,
        envName: servicesInitialConfig.sleep.envName,
        path: "sleep",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.sleep.repo,
        nginxSidecarImageRepo: servicesInitialConfig.sleep.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.readinessContents.name,
        envName: servicesInitialConfig.readinessContents.envName,
        path: "readiness-content",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.readinessContents.repo,
        nginxSidecarImageRepo: servicesInitialConfig.readinessContents.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.chat.name,
        envName: servicesInitialConfig.chat.envName,
        path: "chat",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.chat.repo,
        nginxSidecarImageRepo: servicesInitialConfig.chat.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.classes.name,
        envName: servicesInitialConfig.classes.envName,
        path: "classes",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.classes.repo,
        nginxSidecarImageRepo: servicesInitialConfig.classes.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.callRequest.name,
        envName: servicesInitialConfig.callRequest.envName,
        path: "call-request",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.callRequest.repo,
        nginxSidecarImageRepo: servicesInitialConfig.callRequest.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
    {
        name: servicesInitialConfig.telemedicine.name,
        envName: servicesInitialConfig.telemedicine.envName,
        path: "telemedicine",
        healthPath: "/health",
        port: 9000,
        imageRepo: servicesInitialConfig.telemedicine.repo,
        nginxSidecarImageRepo: servicesInitialConfig.telemedicine.sidecarRepo,
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonS3FullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ]
    },
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
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy

        ],
        command: ["php", "artisan", "sqs:consume-email"]
    },
    {
        name: servicesInitialConfig.pdfGeneratorService.name,
        envName: servicesInitialConfig.pdfGeneratorService.envName,
        path: "pdf-generator",
        imageRepo: servicesInitialConfig.pdfGeneratorService.repo,
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonSESFullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy
        ],
        command: ["php", "artisan", "queue:work", "pdf_raw_sqs", "--sleep=3", "--daemon", "--max-jobs=1000", "--max-time=3600"]
    },
    {
        name: servicesInitialConfig.notifications.name,
        envName: servicesInitialConfig.notifications.envName,
        path: "notifications",
        imageRepo: servicesInitialConfig.notifications.repo,
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            aws.iam.ManagedPolicy.AmazonSESFullAccess,
            aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
            aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy
        ],
        command: ["php", "artisan", "queue:work", "raw_sqs", "--sleep=3", "--daemon", "--max-jobs=1000", "--max-time=3600"]
    },
];

export { frontendServices, goServices, lambdaServices, laravelServices, servicesInitialConfig, workerServices };
  