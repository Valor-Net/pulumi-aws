import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export function createVpcLink(name: string, subnetIds: pulumi.Input<string[]> | pulumi.Output<string[]>) {
    const resolvedSubnetIds = pulumi.output(subnetIds);
    
    return new aws.apigatewayv2.VpcLink(name, {
        name: name,
        subnetIds: resolvedSubnetIds,
        securityGroupIds: [],
    });
}