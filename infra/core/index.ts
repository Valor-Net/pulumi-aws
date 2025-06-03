import * as pulumi from "@pulumi/pulumi";

const stack = pulumi.getStack();

const stackMap: Record<string, () => void> = {
    "dev-core":        () => require("./dev.ts"),
    "staging-core":    () => require("./staging.ts"),
    "production-core": () => require("./production.ts"),
};

const loader = stackMap[stack];
if (!loader) {
    throw new Error(
        `Stack '${stack}' não reconhecida no módulo 'core'.\n` +
        `Use exatamente um dos valores: 'dev-core', 'staging-core' ou 'production-core'.`
    );
}

loader();
