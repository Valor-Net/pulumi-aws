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
    publicAccessible: boolean
}

export function createRdsInstance(args: RdsArgs): aws.rds.Instance {
    const subnetGroup = new aws.rds.SubnetGroup(`${args.name}-subnet-group`, {
        subnetIds: args.subnetIds,
    }); 

    return new aws.rds.Instance(args.name, {
        allocatedStorage: args.allocatedStorage ?? 20,
        engine: "mysql",
        engineVersion: "8.0",
        instanceClass: args.instanceClass ?? "db.t3.micro",
        dbName: args.dbName,
        username: args.username,
        password: args.password,
        dbSubnetGroupName: subnetGroup.name,
        vpcSecurityGroupIds: args.vpcSecurityGroupIds,
        skipFinalSnapshot: true,
        publiclyAccessible: args.publicAccessible,
        multiAz: false,
    });
}
