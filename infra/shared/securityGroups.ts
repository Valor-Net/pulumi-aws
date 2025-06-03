import * as aws from "@pulumi/aws";
import { Input } from "@pulumi/pulumi";

export function createSecurityGroup(
    name: string,
    vpcId: Input<string>,
    ingressRules: aws.types.input.ec2.SecurityGroupIngress[],
    egressRules?: aws.types.input.ec2.SecurityGroupEgress[]
) {
    return new aws.ec2.SecurityGroup(name, {
        vpcId,
        ingress: ingressRules,
        egress: egressRules ?? [{
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            cidrBlocks: ["0.0.0.0/0"]
        }],
    });
}
