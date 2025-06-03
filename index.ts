import * as pulumi from "@pulumi/pulumi";

const stack = pulumi.getStack();

const moduleMap: Record<string, () => void> = {
    "core":     () => require("./infra/core/index.ts"),
    "services": () => require("./infra/services/index.ts"),
};

const parts = stack.split("-");

if (parts.length !== 2) {
    throw new Error(
        `Nome de stack inválido: '${stack}'. Deve estar no formato "<env>-<module>".\n` +
        `Exemplos válidos: "dev-core", "staging-core", "production-core",\n` + `"dev-services", "staging-services", "production-services".`
    );
}

const moduleSuffix = parts[1];

const loader = moduleMap[moduleSuffix];
if (!loader) {
    throw new Error(
        `Módulo '${moduleSuffix}' não reconhecido. Use "core" ou "services" como sufixo de stack.`
    );
}

loader();
