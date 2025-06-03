import * as pulumi from "@pulumi/pulumi";

const stack = pulumi.getStack();

const stackMap: Record<string, () => any> = {
    "staging-core":    () => require("./infra/core/staging"),
    "staging-services": () => require("./infra/services/staging"),
    "dev-core":        () => require("./infra/core/dev"),
    "dev-services":    () => require("./infra/services/dev"),
    "production-core": () => require("./infra/core/production"),
    "production-services": () => require("./infra/services/production"),
};

const loader = stackMap[stack];
if (!loader) {
    throw new Error(`Stack '${stack}' não reconhecida.`);
}

const mod = loader();
if (typeof mod.getExports !== "function") {
    throw new Error(`Módulo da stack '${stack}' não possui função getExports().`);
}
const exportsObj = mod.getExports();

Object.assign(exports, exportsObj);
