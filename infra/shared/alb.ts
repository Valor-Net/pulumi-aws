import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { Input } from "@pulumi/pulumi";

export function createAlb(
    name: string,
    vpc: awsx.ec2.Vpc,
    securityGroupIds?: Input<Input<string>[]>,
    isPublic: boolean = false,
): awsx.lb.ApplicationLoadBalancer {
    return new awsx.lb.ApplicationLoadBalancer(name, {
        name: name,
        internal: !isPublic,
        securityGroups: securityGroupIds
            ?? vpc.vpc.defaultSecurityGroupId.apply(id => [id]),
        subnetIds: isPublic ? vpc.publicSubnetIds : vpc.privateSubnetIds,
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
        name: `tg-${args.svc.name}`,
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

export function createFrontendTgAndRule(args: {
    albArn: Input<string>;
    listenerArn: Input<string>;
    svc: { name: string; port: number, healthPath?: string };
    vpcId: Input<string>;
    priority: number;
    hostHeaders?: string[];
}) {
    const tg = new aws.lb.TargetGroup(`tg-${args.svc.name}`, {
        name: `tg-${args.svc.name}`,
        vpcId: args.vpcId,
        port: args.svc.port,
        protocol: "HTTP",
        targetType: "ip",
        healthCheck: { 
            path: args.svc.healthPath ?? "/api/health",
            matcher: "200",
            interval: 30,
            timeout: 5,
            healthyThreshold: 2,
            unhealthyThreshold: 2,
        },
    });

    const conditions: aws.lb.ListenerRuleArgs["conditions"] = [
        {
            pathPattern: { values: ["/*"] }, // Captura todas as rotas
        }
    ];

    if (args.hostHeaders && args.hostHeaders.length > 0) {
        conditions.push({
            hostHeader: { values: args.hostHeaders },
        });
    }

    new aws.lb.ListenerRule(`rule-${args.svc.name}`, {
        listenerArn: args.listenerArn,
        priority: args.priority,
        actions: [{ type: "forward", targetGroupArn: tg.arn }],
        conditions,
    });

    return tg;
}