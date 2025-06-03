import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export function createVpcLink(
  name: string,
  subnetIds: pulumi.Input<pulumi.Input<string>[]>
): aws.apigatewayv2.VpcLink {
  return new aws.apigatewayv2.VpcLink(name, {
    name: `${name}-vpc-link`,
    subnetIds,
    securityGroupIds: [],
  });
}
