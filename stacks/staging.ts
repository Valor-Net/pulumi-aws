import * as pulumi from "@pulumi/pulumi";
import { createAlb } from "../shared/alb";
import { createHttpApi } from "../shared/apiGateway";
import { createVpc } from "../shared/vpc";
import { createVpcLink } from "../shared/vpcLink";

const config = new pulumi.Config();
const stackName = pulumi.getStack();

const vpc = createVpc(`${stackName}-vpc`);
const alb = createAlb(`${stackName}-alb`, vpc);
const httpApi = createHttpApi(`${stackName}-api`);
const vpcLink = createVpcLink(`${stackName}-vpc-link`, vpc.privateSubnetIds);

export const apiEndpoint = httpApi.apiEndpoint;
export const albDns = alb.loadBalancer.dnsName;
