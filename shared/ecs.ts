    // shared/ecsHelpers.ts -----------------------------------------------------
    import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

    interface TaskRoleOptions {
        name: string;
        policies?: pulumi.Input<string>[];
        inlinePolicies?: aws.iam.RolePolicyArgs[];
    }

    export function makeHttpFargate(args: {
        svc: { name: string; image: string };
        clusterArn: pulumi.Input<string>;
        tg: aws.lb.TargetGroup;
        sgIds: pulumi.Input<string>[];
        subnets: pulumi.Input<pulumi.Input<string>[]>;
        assignPublicIp?: boolean;
        taskRole: aws.iam.Role;
    }) {
        return new awsx.ecs.FargateService(`${args.svc.name}-svc`, {
            cluster: args.clusterArn,
            desiredCount: 1,
            taskDefinitionArgs: {
                taskRole: { roleArn: args.taskRole.arn },
                executionRole: { roleArn: args.taskRole.arn },
                containers: {
                    web: {
                        name: args.svc.name,
                        image: args.svc.image,
                        cpu: 256,
                        memory: 512,
                        portMappings: [{ containerPort: 80, targetGroup: args.tg }],
                    },
                },
            },
            networkConfiguration: {
                assignPublicIp: args.assignPublicIp ?? false,
                subnets:        args.subnets,
                securityGroups: args.sgIds,
            },
        });
    }

    export function makeWorkerFargate(args: {
        svc: { name: string; image: string; command: pulumi.Input<string>[]; cpu?: number; memory?: number };
        clusterArn: pulumi.Input<string>;
        sgIds: pulumi.Input<string>[];
        subnets:    pulumi.Input<pulumi.Input<string>[]>;
        assignPublicIp?: boolean;
    }) {
        return new awsx.ecs.FargateService(`${args.svc.name}-worker`, {
            cluster: args.clusterArn,
            desiredCount: 1,
            taskDefinitionArgs: {
                containers: {
                    worker: {
                        name: args.svc.name,
                        image: args.svc.image,
                        cpu: args.svc.cpu ?? 256,
                        memory: args.svc.memory ?? 512,
                        command: args.svc.command,
                    },
                },
            },
            networkConfiguration: {
                assignPublicIp: args.assignPublicIp ?? false,
                subnets:        args.subnets,
                securityGroups: args.sgIds,
            },
        });
    }

    export function createEcsTaskRole(opts: TaskRoleOptions): aws.iam.Role {
        const role = new aws.iam.Role(`${opts.name}-role`, {
            assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
                Service: "ecs-tasks.amazonaws.com",
            }),
        });

        new aws.iam.RolePolicyAttachment(`${opts.name}-ecs-exec-policy`, {
            role: role.name,
            policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
        });

        if (opts.policies) {
            opts.policies.forEach((policyArn, idx) => {
                new aws.iam.RolePolicyAttachment(`${opts.name}-policy-${idx}`, {
                    role: role.name,
                    policyArn: policyArn,
                });
            });
        }

        if (opts.inlinePolicies) {
            opts.inlinePolicies.forEach((inlinePolicy, idx) => {
                new aws.iam.RolePolicy(`${opts.name}-inline-${idx}`, {
                    ...inlinePolicy,
                    role: role.name,
                });
            });
        }

        return role;
    }
