import * as aws from '@pulumi/aws';
import { Input, Output } from "@pulumi/pulumi";
/** Serviços que expõem rota HTTP */
export interface HttpSvc {
    name: string;
    envName: string;
    path: string;
    imageRepo: string;
    nginxSidecarImageRepo?: string;
    port: number;
    tech: string;
    policies?: (string | Output<string>)[];
    healthPath?: string;
}
  
export interface WorkerSvc {
    name: string;
    envName: string;
    path: string;
    imageRepo: string;
    nginxSidecarImageRepo?: string;
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
    policies?: (string | Output<string>)[];
    supportedTenants: TenantConfig[];
}




/* EDITAR AQUI quando nascer novo frontend */
const frontendServices: FrontendSvc[] = [
    {
        name: "valornet-frontend",
        envName: "ValornetFrontend", 
        imageRepo: "staging-valornet-frontend-repo",
        port: 3000,
        tech: "nextjs",
        policies: [
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        ],
        supportedTenants: [
            {
                tenant: "demo",
                subdomain: "demo.valornetvets.com",
                customSettings: {
                    theme: "default-theme",
                }
            },
        ]
    },
];

  
/* EDITAR AQUI quando nascer novo serviço */
const httpServices: HttpSvc[] = [
    {
        name: "auth-service",
        envName: "AuthService",
        path: "auth",
        healthPath: "/health",
        port: 9000,
        imageRepo: "staging-auth-service-repo",
        nginxSidecarImageRepo: "staging-auth-service-nginx-repo",
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        ]
    },
];
  
const workerServices: WorkerSvc[] = [
    {
        name: "email-service",
        envName: "EmailWorker",
        path: "email",
        imageRepo: "staging-email-service-repo",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        ],
        command: ["php", "artisan", "sqs:consume-email"]
    },
];

export { frontendServices, httpServices, workerServices };
  