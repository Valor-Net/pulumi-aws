import { Input } from "@pulumi/pulumi";

/** Serviços que expõem rota HTTP */
interface HttpSvc {
    name: string;
    path: string;
    image: string;
    healthPath?: string;
}
  
interface WorkerSvc {
    name: string;
    image: string;
    command: Input<string>[];
    cpu?: number;
    memory?: number;
}
  
  /* EDITAR AQUI quando nascer novo serviço */
const httpServices: HttpSvc[] = [
    { name: "auth-service", path: "auth",  image: "1234.dkr.ecr.us-east-1.amazonaws.com/auth:latest" },
    // { name: "user", image: "1234.dkr.ecr.us-east-1.amazonaws.com/user:latest" },
];
  
const workerServices: WorkerSvc[] = [
    {
        name: "email-service",
        image: "1234.dkr.ecr.us-east-1.amazonaws.com/email:latest",
        command: ["npm","run","queue:work"]
    },
];

export { httpServices, workerServices };
  