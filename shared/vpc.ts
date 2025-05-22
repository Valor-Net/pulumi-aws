import * as awsx from "@pulumi/awsx";

export function createVpc(name: string): awsx.ec2.Vpc {
    return new awsx.ec2.Vpc(name, {
        cidrBlock: "10.0.0.0/16",
        numberOfAvailabilityZones: 2,
        subnetSpecs: [{ type: "Public" }, { type: "Private" }],
        tags: { Name: `${name}-vpc`, Purpose: 'Services VPC network' },
    });
}