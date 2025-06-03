import * as pulumi from "@pulumi/pulumi";

const stack = pulumi.getStack();

const stackMap: Record<string, () => void> = {
    "dev-services":        () => require("./dev.ts"),
    "staging-services":    () => require("./staging.ts"),
    "production-services": () => require("./production.ts"),
};

const loader = stackMap[stack];
if (!loader) {
    throw new Error(
        `Stack '${stack}' não reconhecida no módulo 'services'.\n` +
        `Use exatamente um dos valores: 'dev-services', 'staging-services' ou 'production-services'.`
    );
}

loader();
