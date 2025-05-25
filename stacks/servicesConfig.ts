import * as aws from '@pulumi/aws';
import { Input } from "@pulumi/pulumi";
/** Serviços que expõem rota HTTP */
interface HttpSvc {
    name: string;
    path: string;
    image: string;
    policies?: string[];
    healthPath?: string;
}
  
interface WorkerSvc {
    name: string;
    image: string;
    command: Input<string>[];
    policies?: string[];
    cpu?: number;
    memory?: number;
}
  
/* EDITAR AQUI quando nascer novo serviço */
const httpServices: HttpSvc[] = [
    {
        name: "auth-service",
        path: "auth",
        image: "331240720676.dkr.ecr.us-east-1.amazonaws.com/staging-auth-service-repo-18f6832:latest",
        policies: [
            aws.iam.ManagedPolicy.AmazonSQSFullAccess,
            aws.iam.ManagedPolicy.SecretsManagerReadWrite,
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
  