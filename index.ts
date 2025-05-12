import * as pulumi from "@pulumi/pulumi";

const stack = pulumi.getStack();
const stackMap: Record<string, () => void> = {
    dev: () => require("./stacks/dev"),
    staging: () => require("./stacks/staging"),
    prod: () => require("./stacks/prod"),
};

if (stackMap[stack]) {
    stackMap[stack]();
} else {
    throw new Error(`Stack '${stack}' não reconhecida.`);
}