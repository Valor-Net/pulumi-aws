import { createQueue } from "../shared/sqs";

const stagingQueue = createQueue({
    name: "valornet-staging-queue",
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
});

export const stagingQueueUrl = stagingQueue.id;
