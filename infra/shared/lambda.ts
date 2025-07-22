import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildImageUrl } from "./ecs";

export function makeLambdaService(args: {
    svc: { name: string; imageRepo: string; imageTag: string };
    memorySize?: number;
    timeout?: number;
    role: aws.iam.Role;
    env?: Record<string, pulumi.Input<string>>;
}) {

    const lambda = new aws.lambda.Function(args.svc.name, {
        name: args.svc.name,
        role: args.role.arn,
        memorySize: args.memorySize ?? 1536,
        timeout: args.timeout ?? 900,
        environment: {
            variables: {
                ...(args.env ?? {}),
            }
        },
        packageType: "Image",
        imageUri: buildImageUrl(args.svc.imageRepo, args.svc.imageTag),
    });

    

    return lambda;
}
