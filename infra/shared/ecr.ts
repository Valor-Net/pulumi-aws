import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { ServiceInitialConfig } from '../servicesConfig';

export const createEcrRepo = (name: string, stack: string, config: ServiceInitialConfig) => {
    const repo = new aws.ecr.Repository(name, {
        name: name,
        imageScanningConfiguration: { scanOnPush: false },
        imageTagMutability: "MUTABLE",
        encryptionConfigurations: [{ encryptionType: "AES256" }],
        tags: { service: config.name, environment: stack },
    });

    new aws.ecr.LifecyclePolicy(`${name}-lifecycle`, {
        repository: repo.name,
        policy: pulumi.interpolate`{
            "rules": [{
                "rulePriority": 1,
                "description": "Keep last 3 images",
                "selection": { "tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 3 },
                "action": { "type": "expire" }
            }]
        }`,
    });

    return repo;
}
