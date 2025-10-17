// infra/base-core/index.ts
import * as pulumi from "@pulumi/pulumi";
import { ServiceInitialConfig } from "../servicesConfig";
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
        stack,
        serviceName: name,
        sidecar: config.nginxSidecar ?? false,
    });
    
    const repo = createEcrRepo(config.imageRepo, stack, {
        name: name,
        repo: config.imageRepo,
    } as ServiceInitialConfig);

    ecrRepos[name] = repo.repositoryUrl;

    if(config.nginxSidecarImageRepo) {
        const sidecarRepo = createEcrRepo(config.nginxSidecarImageRepo, stack, {
            name: name + "-nginx",
            repo: config.nginxSidecarImageRepo,
        } as ServiceInitialConfig);
        ecrRepos[name + "-nginx"] = sidecarRepo.repositoryUrl;
    }
}



/* Outputs ---------------------------------------------------------- */
export function getExports() {
    return {
        ecrRepos: ecrRepos,
    };
}