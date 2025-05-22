import * as aws from "@pulumi/aws";

export function createVpcLink(name: string, subnets: aws.ec2.Subnet[]): aws.apigatewayv2.VpcLink {
    return new aws.apigatewayv2.VpcLink(name, {
        name: `${name}-vpc-link`,
        subnetIds: subnets.map(s => s.id),
        securityGroupIds: [],
    });
}
