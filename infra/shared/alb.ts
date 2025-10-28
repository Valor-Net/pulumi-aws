import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { Input } from "@pulumi/pulumi";

export function createAlb(
    name: string,
    vpc: awsx.ec2.Vpc,
    securityGroupIds?: Input<Input<string>[]>,
    internal: boolean = true,
): awsx.lb.ApplicationLoadBalancer {
    return new awsx.lb.ApplicationLoadBalancer(name, {
        name,
        internal,
        securityGroups: securityGroupIds
            ?? vpc.vpc.defaultSecurityGroupId.apply(id => [id]),
        subnetIds: internal ? vpc.privateSubnetIds : vpc.publicSubnetIds,
    });
}

export function createTgAndRule(args: {
    tgName: string,
    ruleName: string,
    albArn: Input<string>;
    listenerArn: Input<string>;
    svc: { healthPath?: string, path: string, port: number };
    vpcId: Input<string>;
    priority: number;
}) {
    const tg = new aws.lb.TargetGroup(args.tgName, {
        name: args.tgName,
        vpcId: args.vpcId,
        port: args.svc.port,
        protocol: "HTTP",
        targetType: "ip",
        healthCheck: { path: args.svc.healthPath ?? "/health" },
    });
  
    new aws.lb.ListenerRule(args.ruleName, {
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
    tgName: string,
    ruleName: string,
    albArn: Input<string>;
    listenerArn: Input<string>;
    svc: { name: string; port: number, healthPath?: string };
    vpcId: Input<string>;
    priority: number;
    hostHeaders?: string[];
}) {
    const tg = new aws.lb.TargetGroup(args.tgName, {
        name: args.tgName,
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

    // if (args.hostHeaders && args.hostHeaders.length > 0) {
    //     conditions.push({
    //         hostHeader: { values: args.hostHeaders },
    //     });
    // }

    new aws.lb.ListenerRule(args.ruleName, {
        listenerArn: args.listenerArn,
        priority: args.priority,
        actions: [{ type: "forward", targetGroupArn: tg.arn }],
        conditions,
    });

    return tg;
}