import * as aws from '@pulumi/aws';
import { Input, Output } from "@pulumi/pulumi";
/** Serviços que expõem rota HTTP */
interface HttpSvc {
    name: string;
    path: string;
    image: string;
    nginxSidecarImage?: string;
    port: number;
    tech: string;
    policies?: (string | Output<string>)[];
    healthPath?: string;
}
  
interface WorkerSvc {
    name: string;
    image: string;
    nginxSidecarImage?: string;
    command: Input<string>[];
    policies?: string[];
    cpu?: number;
    memory?: number;
}

export const testSecretsManagerPolicy = new aws.iam.Policy("test-secrets-manager-policy", {
    description: "Policy de teste: full-access (Get/Describe/List) ao Secrets Manager",
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: [
                    "secretsmanager:GetSecretValue",
                    "secretsmanager:DescribeSecret",
                    "secretsmanager:ListSecrets",
                    "secretsmanager:ListSecretVersionIds",
                ],
                Resource: "*",
            },
        ],
    }),
});

  
/* EDITAR AQUI quando nascer novo serviço */
const httpServices: HttpSvc[] = [
    {
        name: "auth-service",
        path: "auth",
        healthPath: "/health",
        port: 9000,
        image: "331240720676.dkr.ecr.us-east-1.amazonaws.com/staging-auth-service-repo-18f6832:latest",
        nginxSidecarImage: "331240720676.dkr.ecr.us-east-1.amazonaws.com/staging-auth-service-nginx-repo-b64f48f:latest",
        tech: "laravel",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
            testSecretsManagerPolicy.arn.apply(arn => arn)
        ]
    },
];
  
const workerServices: WorkerSvc[] = [
    // {
    //     name: "email-service",
    //     image: "1234.dkr.ecr.us-east-1.amazonaws.com/email:latest",
    // policies: [
    //     aws.iam.ManagedPolicy.AmazonSQSFullAccess,
    //     aws.iam.ManagedPolicy.SecretsManagerReadWrite,
    // ]
    //     command: ["npm","run","queue:work"]
    // },
];

export { httpServices, workerServices };
  