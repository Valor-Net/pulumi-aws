import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

interface TaskRoleOptions {
    name: string;
    policies?: pulumi.Input<string>[];
    inlinePolicies?: aws.iam.RolePolicyArgs[];
}

export function makeHttpFargate(args: {
    svc: { name: string; image: string, port: number };
    clusterArn: pulumi.Input<string>;
    tg: aws.lb.TargetGroup;
    sgIds: pulumi.Input<string>[];
    subnets: pulumi.Input<pulumi.Input<string>[]>;
    assignPublicIp?: boolean;
    taskRole: aws.iam.Role;
    executionRole?: aws.iam.Role;
    env?: Record<string, pulumi.Input<string>>;
    secrets?: Record<string, aws.secretsmanager.Secret>;
    nginxSidecarImage?: string;
}) {
    const execRole = args.executionRole || createEcsExecutionRole(`${args.svc.name}-execution`);

    const phpContainerName = args.nginxSidecarImage ? "php" : "web";
    const phpContainer = {
        name: args.svc.name,
        image: args.svc.image,
        cpu: 256,
        memory: 512,
        portMappings: args.nginxSidecarImage
            ? undefined
            : [{
                containerPort: args.svc.port,
                hostPort:      args.svc.port,
                targetGroup:   args.tg,
            }],
        environment: Object.entries(args.env ?? {}).map(([k, v]) => ({
            name: k,
            value: v,
        })),
        secrets: Object.entries(args.secrets ?? {}).map(([k, secret]) => ({
            name: k,
            valueFrom: secret.arn,
        })),
        logConfiguration: {
            logDriver: "awslogs",
            options: {
                "awslogs-create-group": "true",
                "awslogs-group": `/ecs/${args.svc.name}`,
                "awslogs-region": aws.getRegion().then(r => r.name),
                "awslogs-stream-prefix": "ecs",
            },
        },
    };

    const containers: Record<string, any> = {
        [phpContainerName]: phpContainer,
    };

    if (args.nginxSidecarImage) {
        containers["web"] = {
            name: "web",
            image: args.nginxSidecarImage,
            cpu: 128,
            memory: 128,
            portMappings: [{ containerPort: 80, hostPort: 80, targetGroup: args.tg }],
            essential: true,
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-create-group": "true",
                    "awslogs-group": `/ecs/${args.svc.name}-nginx`,
                    "awslogs-region": aws.getRegion().then(r => r.name),
                    "awslogs-stream-prefix": "ecs",
                },
            },
        };
    }
    
    return new awsx.ecs.FargateService(`${args.svc.name}-svc`, {
        forceNewDeployment: true,
        cluster: args.clusterArn,
        desiredCount: 1,
        taskDefinitionArgs: {
            taskRole: { roleArn: args.taskRole.arn },
            executionRole: { roleArn: execRole.arn },
            containers
        },
        networkConfiguration: {
            assignPublicIp: args.assignPublicIp ?? false,
            subnets: args.subnets,
            securityGroups: args.sgIds,
        },
    });
}

export function makeWorkerFargate(args: {
    svc: { name: string; image: string; command: pulumi.Input<string>[]; cpu?: number; memory?: number };
    clusterArn: pulumi.Input<string>;
    sgIds: pulumi.Input<string>[];
    subnets: pulumi.Input<pulumi.Input<string>[]>;
    assignPublicIp?: boolean;
    taskRole?: aws.iam.Role;
    executionRole?: aws.iam.Role;
    env?: Record<string, pulumi.Input<string>>;
    secrets?: Record<string, aws.secretsmanager.Secret>;
}) {
    const execRole = args.executionRole || createEcsExecutionRole(`${args.svc.name}-execution`);
    const tRole = args.taskRole || createEcsTaskRole({
        name: `${args.svc.name}-task`,
        policies: []
    });

    return new awsx.ecs.FargateService(`${args.svc.name}-worker`, {
        cluster: args.clusterArn,
        desiredCount: 1,
        taskDefinitionArgs: {
            taskRole: { roleArn: tRole.arn },
            executionRole: { roleArn: execRole.arn },
            containers: {
                worker: {
                    name: args.svc.name,
                    image: args.svc.image,
                    cpu: args.svc.cpu ?? 256,
                    memory: args.svc.memory ?? 512,
                    command: args.svc.command,
                    environment: Object.entries(args.env ?? {}).map(([k, v]) => ({
                        name: k,
                        value: v
                    })),
                    secrets: Object.entries(args.secrets ?? {}).map(([k, secret]) => ({
                        name: k,
                        valueFrom: secret.arn,
                    })),
                    logConfiguration: {
                        logDriver: "awslogs",
                        options: {
                            "awslogs-create-group": "true",
                            "awslogs-group": `/ecs/${args.svc.name}`,
                            "awslogs-region": aws.getRegion().then(r => r.name),
                            "awslogs-stream-prefix": "ecs"
                        }
                    }
                },
            },
        },
        networkConfiguration: {
            assignPublicIp: args.assignPublicIp ?? false,
            subnets: args.subnets,
            securityGroups: args.sgIds,
        },
    });
}

export function createEcsTaskRole(opts: TaskRoleOptions): aws.iam.Role {
    const role = new aws.iam.Role(`${opts.name}-role`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
            Service: "ecs-tasks.amazonaws.com",
        }),
        description: `ECS Task Role for ${opts.name}`
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

export function createEcsExecutionRole(name: string): aws.iam.Role {
    const role = new aws.iam.Role(`${name}-role`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
            Service: "ecs-tasks.amazonaws.com",
        }),
        description: `ECS Task Execution Role for ${name}`
    });

    new aws.iam.RolePolicyAttachment(`${name}-ecs-exec-policy`, {
        role: role.name,
        policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
    });

    new aws.iam.RolePolicyAttachment(`${name}-ecs-exec-secrets-policy`, {
        role: role.name,
        policyArn: aws.iam.ManagedPolicy.SecretsManagerReadWrite,
    });

    new aws.iam.RolePolicyAttachment(`${name}-logs-policy`, {
        role: role.name,
        policyArn: aws.iam.ManagedPolicy.CloudWatchLogsFullAccess,
    });

    return role;
}