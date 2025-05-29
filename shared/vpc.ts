import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { Input } from "@pulumi/pulumi";

export function createVpc(name: string, AZ: number = 2): awsx.ec2.Vpc {
    return new awsx.ec2.Vpc(name, {
        subnetStrategy: "Auto",
        cidrBlock: "10.0.0.0/16",
        numberOfAvailabilityZones: AZ,
        enableDnsHostnames: true,
        subnetSpecs: [{ type: "Public" }, { type: "Private" }],
        tags: { Name: `${name}-vpc`, Purpose: 'Services VPC network' },
    });
}

export function createVpcInterfaceEndpoint(args: {
    name: string;
    vpcId: Input<string>;
    serviceName: string;
    subnetIds: Input<Input<string>[]> | undefined;
    securityGroupIds: Input<Input<string>[]> | undefined;
    privateDnsEnabled: boolean
}): aws.ec2.VpcEndpoint {
    return new aws.ec2.VpcEndpoint(args.name, {
        vpcEndpointType: "Interface",
        vpcId: args.vpcId,
        serviceName: args.serviceName,
        subnetIds: args.subnetIds,
        securityGroupIds: args.securityGroupIds,
        privateDnsEnabled: args.privateDnsEnabled,
      });
}