import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { Input } from "@pulumi/pulumi";

export function createAlb(
    name: string,
    vpc: awsx.ec2.Vpc,
    securityGroupIds?: Input<Input<string>[]>,
): awsx.lb.ApplicationLoadBalancer {
    return new awsx.lb.ApplicationLoadBalancer(name, {
        internal: true,
        securityGroups: securityGroupIds
            ?? vpc.vpc.defaultSecurityGroupId.apply(id => [id]),
        subnetIds: vpc.privateSubnetIds,
    });
}

export function createTgAndRule(args: {
    albArn: Input<string>;
    listenerArn: Input<string>;
    svc: { name: string; healthPath?: string, path: string, port: number };
    vpcId: Input<string>;
    priority: number;
}) {
    const tg = new aws.lb.TargetGroup(`tg-${args.svc.name}`, {
        vpcId: args.vpcId,
        port: args.svc.port,
        protocol: "HTTP",
        targetType: "ip",
        healthCheck: { path: args.svc.healthPath ?? "/health" },
    });
  
    new aws.lb.ListenerRule(`rule-${args.svc.name}`, {
        listenerArn: args.listenerArn,
        priority: args.priority,
        actions: [{ type: "forward", targetGroupArn: tg.arn }],
        conditions: [{
            pathPattern: { values: [`/${args.svc.path}/v1/*`] },
        }],
    });
  
    return tg;
}