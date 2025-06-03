import * as aws from "@pulumi/aws";
import { Input, interpolate } from "@pulumi/pulumi";

export function createHttpApi(name: string): aws.apigatewayv2.Api {
    return new aws.apigatewayv2.Api(name, {
        protocolType: "HTTP",
        name: `${name}-http-api`,
    });
}

export function createAlbIntegration(
    name: string,
    httpApiId: Input<string>,
    vpcLinkId: Input<string>,
    albArn: Input<string>,
): aws.apigatewayv2.Integration {
    return new aws.apigatewayv2.Integration(name, {
        apiId: httpApiId,
        integrationType: "HTTP_PROXY",
        connectionType: "VPC_LINK",
        connectionId: vpcLinkId,
        integrationMethod: "ANY",
        integrationUri: albArn,
        payloadFormatVersion: "1.0",
    });
}

export function createRoute(
    name: string,
    apiId: Input<string>,
    routeKey: string,
    integration: Input<string>,
): aws.apigatewayv2.Route {
    return new aws.apigatewayv2.Route(name, {
        apiId,
        routeKey,
        target: interpolate`integrations/${integration}`,
    });
}

export function createStage(
    name: string,
    apiId: Input<string>,
    stageName: string = "$default",
    autoDeploy = true,
): aws.apigatewayv2.Stage {
    return new aws.apigatewayv2.Stage(name, {
        apiId,
        name: stageName,
        autoDeploy,
    });
}

export function createDomainName(
    name: string,
    domain: Input<string>,
    certArn: Input<string>,
    tlsPolicy: "TLS_1_0" | "TLS_1_2" = "TLS_1_2",
): aws.apigatewayv2.DomainName {
    return new aws.apigatewayv2.DomainName(name, {
    domainName: domain,
        domainNameConfiguration: {
            certificateArn: certArn,
            endpointType: "REGIONAL",
            securityPolicy: tlsPolicy,
        },
    });
}

export function createApiMapping(
    name: string,
    apiId: Input<string>,
    domainId: Input<string>,
    stageName: Input<string>,
    mappingKey: Input<string> = "",
): aws.apigatewayv2.ApiMapping {
    return new aws.apigatewayv2.ApiMapping(name, {
        apiId,
        domainName: domainId,
        stage: stageName,
        apiMappingKey: mappingKey,
    });
}