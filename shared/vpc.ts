import * as awsx from "@pulumi/awsx";

export function createVpc(name: string, AZ: number = 2): awsx.ec2.Vpc {
    return new awsx.ec2.Vpc(name, {
        cidrBlock: "10.0.0.0/16",
        numberOfAvailabilityZones: AZ,
        subnetSpecs: [{ type: "Public" }, { type: "Private" }],
        tags: { Name: `${name}-vpc`, Purpose: 'Services VPC network' },
    });
}