// infra/base-core/index.ts
import * as pulumi from "@pulumi/pulumi";
import { BaseJson, deriveRepos, resolveConfig } from "../shared/configResolver";
import { createEcrRepo } from "../shared/ecr";

const stack = pulumi.getStack();

// Carrega apenas a config base
const baseConfig = resolveConfig({
    basePath: "configs/base.json",
    baseOnly: true,
}) as unknown as BaseJson;

console.log("Base Config loaded:", baseConfig);

/* ECR Repositories -------------------------------------------------- */
// Cria um ECR repo por serviço definido em base.json
const ecrRepos: Record<string, pulumi.Output<string>> = {};

for (const [name, config] of [...Object.entries(baseConfig.services.http), ...Object.entries(baseConfig.services.worker), ...Object.entries(baseConfig.services.lambda), ...Object.entries(baseConfig.services.frontend)]) {

    const { imageRepo, nginxSidecarImageRepo } = deriveRepos({
        serviceName: name,
        sidecar: config.nginxSidecar ?? false,
    });
    
    const repo = createEcrRepo(imageRepo, stack, {
        name: name,
        repo: imageRepo,
    });

    ecrRepos[name] = repo.repositoryUrl;

    if(nginxSidecarImageRepo) {
        const sidecarRepo = createEcrRepo(nginxSidecarImageRepo, stack, {
            name: name + "-nginx",
            repo: nginxSidecarImageRepo,
        });
        ecrRepos[name + "-nginx"] = sidecarRepo.repositoryUrl;
    }
}



/* Outputs ---------------------------------------------------------- */
export function getExports() {
    return {
        ecrRepos: ecrRepos,
    };
}