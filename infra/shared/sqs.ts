import * as aws from "@pulumi/aws";
import { Input } from "@pulumi/pulumi";

interface SqsArgs {
    name: string;
    tags?: Record<string, string>;
    redrivePolicy?: Input<string>;
    visibilityTimeoutSeconds?: number;
    messageRetentionSeconds?: number;
    receiveWaitTimeSeconds?: number;
}

export function createQueue({
    name,
    redrivePolicy,
    tags,
    visibilityTimeoutSeconds = 540,
    messageRetentionSeconds = 1209600,
    receiveWaitTimeSeconds = 10
}: SqsArgs): aws.sqs.Queue {
    return new aws.sqs.Queue(name, {
        name: name,
        visibilityTimeoutSeconds,
        messageRetentionSeconds,
        receiveWaitTimeSeconds,
        tags,
        redrivePolicy: redrivePolicy ? redrivePolicy : undefined,
    });
}