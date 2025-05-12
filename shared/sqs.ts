import * as aws from "@pulumi/aws";

interface SqsArgs {
    name: string;
    tags?: Record<string, string>;
}

export function createQueue({ name, tags }: SqsArgs): aws.sqs.Queue {
    return new aws.sqs.Queue(name, {
        visibilityTimeoutSeconds: 30,
        messageRetentionSeconds: 86400,
        tags,
    });
}
