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

// export function createAlbSg(name: string, vpcId: Input<string>) {
//     return new aws.ec2.SecurityGroup(name, {
//         vpcId,
//         ingress: [{
//             fromPort: 80,
//             toPort: 80,
//             protocol: "tcp",
//             cidrBlocks: ["10.0.0.0/16"]
//         }],
//         egress : [{
//             fromPort: 0,
//             toPort: 0,
//             protocol: "-1",
//             cidrBlocks: ["0.0.0.0/0"]
//         }],
//     });
// }

// export function createTaskSg(name: string, vpcId: Input<string>, albSgId: Input<string>) {
//     return new aws.ec2.SecurityGroup(name, {
//         vpcId,
//         ingress: [{
//             fromPort: 80,
//             toPort: 80,
//             protocol: "tcp",
//             securityGroups: [albSgId],
//         }],
//         egress: [{
//             fromPort: 0,
//             toPort: 0,
//             protocol: "-1",
//             cidrBlocks: ["0.0.0.0/0"],
//         }],
//     });
// }

