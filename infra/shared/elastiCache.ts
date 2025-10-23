import * as aws from "@pulumi/aws";
import { Input } from "@pulumi/pulumi";

interface RedisArgs {
    name: string;
    subnetIds: Input<Input<string>[]>;
    securityGroupIds: Input<string>[];
    nodeType?: string;
    numCacheNodes?: number;
    engineVersion?: string;
}

export function createRedisCluster(args: RedisArgs): aws.elasticache.Cluster {
    const redisParamGroup = new aws.elasticache.ParameterGroup(`${args.name}-param-group`, {
        family: args.engineVersion ?? "redis7",
        description: `Parameter group for ${args.engineVersion ?? "Redis 7"}`,
      });
      
    const subnetGroup = new aws.elasticache.SubnetGroup(`${args.name}-subnet-group`, {
        subnetIds: args.subnetIds,
    });

    return new aws.elasticache.Cluster(args.name, {
        engine: "redis",
        nodeType: args.nodeType ?? "cache.t3.micro",
        numCacheNodes: args.numCacheNodes ?? 1,
        parameterGroupName: redisParamGroup.name,
        subnetGroupName: subnetGroup.name,
        securityGroupIds: args.securityGroupIds,
    });
}
