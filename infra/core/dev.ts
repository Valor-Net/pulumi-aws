import { createQueue } from "../shared/sqs";


const emailDlq = createQueue({
    name: `dev-email-dlq`,
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
});

const devEmailQueue = createQueue({
    name: `valornet-dev-email-queue`,
    redrivePolicy: emailDlq.arn.apply(dlqArn =>
        JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: 3,
        })
    ),
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
    
});

const pdfDlq = createQueue({
    name: `dev-pdf-dlq`,
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
});

const devPdfQueue = createQueue({
    name: `valornet-dev-pdf-queue`,
    redrivePolicy: pdfDlq.arn.apply(dlqArn =>
        JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: 3,
        })
    ),
    tags: {
        Environment: "staging",
        Project: "valornet"
    }
    
});

export const devQueueUrl = devEmailQueue.id;
export const devPdfQueueUrl = devPdfQueue.id;


export function getExports() {
    return {
        devQueueUrl: devEmailQueue.id,
        devPdfQueueUrl: devPdfQueue.id,
    };
}