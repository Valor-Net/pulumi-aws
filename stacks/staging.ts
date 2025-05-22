import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { createAlb } from "../shared/alb";
import {
    createAlbIntegration,
    createApiMapping,
    createDomainName,
    createHttpApi,
    createRoute,
    createStage
} from "../shared/apiGateway";

import { createAlbSg } from "../shared/securityGroups";
import { createVpc } from "../shared/vpc";
import { createVpcLink } from "../shared/vpcLink";
import { httpServices, workerServices } from "./servicesConfig";

const stack   = pulumi.getStack();
const certArn = "arn:aws:acm:us-east-1:331240720676:certificate/f5811ee2-2f5e-4424-a216-5c2a794e78c3";

const vpc      = createVpc(`${stack}`);
const sgAlb    = createAlbSg(`${stack}-alb-sg`,   vpc.vpc.id);
// const sgTasks  = createAlbSg(`${stack}-task-sg`,  vpc.vpc.id);
const alb      = createAlb(`${stack}-alb`, vpc, [sgAlb.id]);

/* ECR --------------------------------------- */
const repoUrls: Record<string, pulumi.Output<string>> = {};
for(const svc of [...httpServices, ...workerServices]) {

    const repo = new aws.ecr.Repository(`${stack}-${svc.name}-repo`, {
        imageScanningConfiguration: { scanOnPush: false },
        imageTagMutability: "MUTABLE",
        encryptionConfigurations: [{ encryptionType: "AES256" }],
        tags: { service: svc.name, environment: stack },
    });
      
    new aws.ecr.LifecyclePolicy(`${stack}-${svc.name}-lifecycle`, {
        repository: repo.name,
        policy: pulumi.interpolate`{
            "rules": [{
                "rulePriority": 1,
                "description": "Keep last 3 images",
                "selection": { "tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 3 },
                "action": { "type": "expire" }
            }]
        }`,
    });


    repoUrls[svc.name] = repo.repositoryUrl;
}

/* Listener + Target Groups + ECS --------------------------------------- */
// const listener = new aws.lb.Listener(`${stack}-http`, {
//   loadBalancerArn: alb.loadBalancer.arn,
//   port: 80, protocol: "HTTP",
//   defaultActions: [{ type: "fixed-response", fixedResponse: {statusCode:"404", contentType:"text/plain"} }],
// });

// const cluster = new aws.ecs.Cluster(`${stack}-cluster`);

// httpServices.forEach((svc, idx) => {
//     const tg = createTgAndRule({
//         albArn: alb.loadBalancer.arn,
//         listenerArn: listener.arn,
//         svc,
//         vpcId: vpc.vpc.id, priority: 10 + idx,
//     });
    
//     makeHttpFargate({
//         svc: { name: svc.name, image: svc.image },
//         clusterArn: cluster.arn,
//         tg,
//         sgIds:   [sgTasks.id],
//         subnets: vpc.privateSubnetIds,
//     })
// });

// workerServices.forEach(w =>
//     makeWorkerFargate({
//         svc: { name: w.name, image: w.image, command: w.command },
//         clusterArn: cluster.arn,
//         sgIds:   [sgTasks.id],
//         subnets: vpc.privateSubnetIds,
//     })
// );

/* API Gateway ----------------------------------------------------------- */
const httpApi  = createHttpApi(`${stack}-api`);
const vpcLink  = createVpcLink(`${stack}-vpclink`, vpc.privateSubnetIds);
const albInt = alb.listeners.apply(listeners => {
    if (!listeners || listeners.length === 0) {
        throw new Error("No listeners available on ALB.");
    }
    return createAlbIntegration(
        `${stack}-int`,
        httpApi.id,
        vpcLink.id,
        listeners[0].arn
    );
});


httpServices.forEach(s =>
    createRoute(`${s.name}-route`, httpApi.id, `ANY /${s.path}/v1/{proxy+}`, albInt.id)
);

/* Stage + Domain -------------------------------------------------------- */
const stage  = createStage("default", httpApi.id, "$default");
const domain = createDomainName("api-domain", "stg.valornetvets.com", certArn);
createApiMapping("map", httpApi.id, domain.id, stage.name, "");

/* Outputs --------------------------------------------------------------- */
export const apiUrl = httpApi.apiEndpoint;
export const ecrRepoUrls = repoUrls;
export const apiDomainTarget = domain.domainNameConfiguration.targetDomainName;