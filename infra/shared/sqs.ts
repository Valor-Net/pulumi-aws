import * as aws from "@pulumi/aws";

interface SqsArgs {
    name: string;
    tags?: Record<string, string>;
}

export function createQueue({ name, tags }: SqsArgs): aws.sqs.Queue {
    return new aws.sqs.Queue(name, {
        name: name,
        visibilityTimeoutSeconds: 60,
        messageRetentionSeconds: 86400,
        tags,
    });
}
