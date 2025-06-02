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

export { httpServices, workerServices };
  