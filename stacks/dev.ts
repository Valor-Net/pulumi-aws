import { createQueue } from "../shared/sqs";

const devQueue = createQueue({
    name: "valornet-dev-queue",
    tags: {
        Environment: "dev",
        Project: "valornet"
    }
});

export const devQueueUrl = devQueue.id;
