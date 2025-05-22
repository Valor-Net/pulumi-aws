import * as aws from "@pulumi/aws";

export function createHttpApi(name: string): aws.apigatewayv2.Api {
    return new aws.apigatewayv2.Api(name, {
        protocolType: "HTTP",
        name: `${name}-http-api`,
    });
}
