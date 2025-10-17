// test-core.ts
import { resolveConfig } from "./infra/shared/configResolver";

const config = resolveConfig({
    basePath: "configs/base.json",
    customerPath: "configs/customers/customer.template.json",
});

console.log("Config resolvida:");
console.dir(config);
