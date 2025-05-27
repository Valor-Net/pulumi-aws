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
    executionRole?: aws.iam.Role; // Novo parâmetro opcional
    env?: Record<string, pulumi.Input<string>>;
    secrets?: Record<string, aws.secretsmanager.Secret>;
}) {
    // Se não fornecer executionRole, criar uma padrão
    const execRole = args.executionRole || createEcsExecutionRole(`${args.svc.name}-execution`);
    
    return new awsx.ecs.FargateService(`${args.svc.name}-svc`, {
        forceNewDeployment: true,
        cluster: args.clusterArn,
        desiredCount: 1,
        taskDefinitionArgs: {
            taskRole: { roleArn: args.taskRole.arn },        // Role para acessar AWS services
            executionRole: { roleArn: execRole.arn },        // Role para executar a task
            containers: {
                web: {
                    name: args.svc.name,
                    image: args.svc.image,
                    cpu: 256,
                    memory: 512,
                    portMappings: [{ containerPort: args.svc.port, targetGroup: args.tg }],
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

export function makeWorkerFargate(args: {
    svc: { name: string; image: string; command: pulumi.Input<string>[]; cpu?: number; memory?: number };
    clusterArn: pulumi.Input<string>;
    sgIds: pulumi.Input<string>[];
    subnets: pulumi.Input<pulumi.Input<string>[]>;
    assignPublicIp?: boolean;
    taskRole?: aws.iam.Role;        // Novo parâmetro opcional
    executionRole?: aws.iam.Role;   // Novo parâmetro opcional
    env?: Record<string, pulumi.Input<string>>;
    secrets?: Record<string, aws.secretsmanager.Secret>;
}) {
    const execRole = args.executionRole || createEcsExecutionRole(`${args.svc.name}-execution`);
    const tRole = args.taskRole || createEcsTaskRole({
        name: `${args.svc.name}-task`,
        policies: [] // Worker básico sem políticas especiais
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