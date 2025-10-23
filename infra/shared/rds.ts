import * as aws from "@pulumi/aws";
import { Input } from "@pulumi/pulumi";

interface RdsArgs {
    name: string;
    dbName: string;
    vpcSecurityGroupIds: Input<string>[];
    subnetIds: Input<Input<string>[]>;
    instanceClass?: string;
    allocatedStorage?: number;
    dbEngine?: "mysql" | "postgres";
    username: string;
    password: Input<string>;
    publicAccessible: boolean;
    engine: string;
    engineVersion: string;
    backupRetentionPeriod: number;
    skipFinalSnapshot: boolean;
    multiAz: boolean;
}

export function createRdsInstance(args: RdsArgs): aws.rds.Instance {
    const subnetGroup = new aws.rds.SubnetGroup(`${args.name}-subnet-group`, {
        subnetIds: args.subnetIds,
    }); 

    return new aws.rds.Instance(args.name, {
        allocatedStorage: args.allocatedStorage ?? 20,
        engine: args.engine,
        engineVersion: args.engineVersion,
        instanceClass: args.instanceClass ?? "db.t3.micro",
        dbName: args.dbName,
        username: args.username,
        password: args.password,
        dbSubnetGroupName: subnetGroup.name,
        vpcSecurityGroupIds: args.vpcSecurityGroupIds,
        skipFinalSnapshot: args.skipFinalSnapshot,
        publiclyAccessible: args.publicAccessible,
        multiAz: args.multiAz,
    });
}
