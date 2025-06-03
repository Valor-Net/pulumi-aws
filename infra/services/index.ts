import * as pulumi from "@pulumi/pulumi";

const stack = pulumi.getStack();

const stackMap: Record<string, () => any> = {
    "dev-services":        () => require("./dev"),
    "staging-services":    () => require("./staging"),
    "production-services": () => require("./production"),
};

const loader = stackMap[stack];
if (!loader) {
    throw new Error(
        `Stack '${stack}' não reconhecida no módulo 'core'.\n` +
        `Use exatamente um dos valores: ${Object.keys(stackMap).join(", ")}.`
    );
}

const mod = loader();

if (typeof mod.getExports !== "function") {
    throw new Error(`Stack '${stack}' no módulo 'core' não implementa getExports().`);
}

const exportsObj = mod.getExports();

Object.assign(exports, exportsObj);
