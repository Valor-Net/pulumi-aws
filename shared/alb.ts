import * as awsx from "@pulumi/awsx";

export function createAlb(name: string, vpc: awsx.ec2.Vpc): awsx.lb.ApplicationLoadBalancer {
    return new awsx.lb.ApplicationLoadBalancer(name, {
        internal: true,
        securityGroups: vpc.vpc.defaultSecurityGroupId.apply(id => [id]),
        subnetIds: vpc.publicSubnetIds,
    });
}


