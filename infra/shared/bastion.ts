import * as aws from "@pulumi/aws";
import { Input } from "@pulumi/pulumi";

export interface BastionConfig {
    vpcId: Input<string>;
    publicSubnetId: Input<string>;
    keyName: Input<string>;
    instanceType: string;
}



export function createBastionHost(name: string, config: BastionConfig, sgId: Input<string>) {
    const ami = aws.ec2.getAmi({
        owners: ["amazon"],
        filters: [
            { name: "name", values: ["amzn2-ami-hvm-*-x86_64-gp2"] },
            { name: "state", values: ["available"] },
        ],
        mostRecent: true,
    });

    return new aws.ec2.Instance(name, {
        ami: ami.then(a => a.id),
        instanceType: config.instanceType,
        subnetId: config.publicSubnetId,
        keyName: config.keyName,
        vpcSecurityGroupIds: [sgId],
        associatePublicIpAddress: true,
        tags: { Name: `${name}-bastion` },
    });
}
