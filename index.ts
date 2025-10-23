import * as pulumi from "@pulumi/pulumi";

const stack = pulumi.getStack();

// Mapeamento fixo dos módulos
const stackMap: Record<string, () => any> = {
    "base-core":         () => require("./infra/base.ts"),
    "customer-core":     () => require("./infra/core.ts"),
    "customer-services": () => require("./infra/services.ts"),
};

// Identificação de tipo de stack
const isBase = stack === "base-core";
const isCore = stack.endsWith("-core");
const isStaging = stack.endsWith("-staging");
const isProduction = stack.endsWith("-production");

const conditionMap: Record<string, boolean> = {
    "base-core": isBase,
    "customer-core": isCore,
    "customer-services": isStaging || isProduction,
};

// seleciona a primeira condição verdadeira
const selectedKey = Object.keys(conditionMap).find(k => conditionMap[k]);
console.log(selectedKey);
const loader = selectedKey ? stackMap[selectedKey] : null;


if (!loader) {
    throw new Error(`Stack '${stack}' não reconhecida.`);
}

const mod = loader();

if (typeof mod.getExports !== "function") {
    throw new Error(`Módulo da stack '${stack}' não possui função getExports().`);
}

const exportsObj = mod.getExports();
Object.assign(exports, exportsObj);
