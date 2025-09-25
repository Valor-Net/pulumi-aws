import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";

/** ===== Tipos de entrada (JSONs) ===== */
type ServiceKind = "http" | "worker" | "lambda" | "frontend";

type ECSDefaults = {
  cpu?: number;
  memory?: number;
  env?: Record<string, string>;
};

type DefaultsByKind = {
  ecs?: ECSDefaults;
  http?: {
    port?: number;
    healthPath?: string;
    tech?: "laravel" | "go" | string;
    policies?: string[]; // pode conter "bundle:*" e/ou ARNs diretas
  };
  worker?: {
    policies?: string[];
  };
  lambda?: {
    policies?: string[];
    triggeredBy?: string[]; // ex: ["s3","sqs"]
  };
  frontend?: {
    port?: number;
    healthPath?: string;
    tech?: "nextjs" | "react" | string;
    policies?: string[];
  };
};

type BaseJson = {
  defaults: DefaultsByKind;
  services: {
    http: Record<
      string,
      {
        imageTag?: string;
        path?: string;
        port?: number;
        healthPath?: string;
        tech?: string;
        nginxSidecar?: boolean;
        policies?: string[];
      }
    >;
    worker: Record<
      string,
      {
        imageTag?: string;
        command?: string[]; // para workers
        queues?: string[];
        policies?: string[];
      }
    >;
    lambda: Record<
      string,
      {
        imageTag?: string;
        triggeredBy?: string[];
        policies?: string[];
        env?: Record<string, string>;
      }
    >;
    frontend: Record<
      string,
      {
        imageTag?: string;
        port?: number;
        healthPath?: string;
        tech?: string;
        policies?: string[];
        env?: Record<string, string>;
        tenants?: Array<{
          tenant: string;
          subdomain: string;
          customSettings?: Record<string, any>;
        }>;
      }
    >;
  };
};

type CustomerJson = {
    customer: string;              // ex: "quest"
    environment: "staging" | "production" | string;
    enable: string[];              // ex: ["*", "auth-service", ...]
    disable: string[];             // ex: ["videos-service"]
    overrides: {
        global?: {
            ecs?: ECSDefaults;
            env?: Record<string, string>;
        };
        http?: Record<string, Partial<BaseJson["services"]["http"][string] & { ecs: ECSDefaults }>>;
        worker?: Record<string, Partial<BaseJson["services"]["worker"][string] & { ecs: ECSDefaults }>>;
        lambda?: Record<string, Partial<BaseJson["services"]["lambda"][string] & { ecs: ECSDefaults }>>;
        frontend?: Record<string, Partial<BaseJson["services"]["frontend"][string] & { ecs: ECSDefaults }>>;
    };
};

/** ===== Tipos resolvidos (saída) ===== */
export type ResolvedPolicyArn = string;

export type ResolvedCommon = {
    name: string;                // "auth-service"
    kind: ServiceKind;           // "http" | "worker" | "lambda" | "frontend"
    imageTag?: string;
    ecs: Required<ECSDefaults>;  // cpu, memory, env (com defaults aplicados)
    policies: ResolvedPolicyArn[];
    imageRepo: string;           // derivado do stack/environment
    nginxSidecarImageRepo?: string;
    nginxSidecar?: boolean;
};

export type ResolvedHttp = ResolvedCommon & {
    path: string;
    port: number;
    healthPath: string;
    tech: string; // "laravel" | "go"
};

export type ResolvedWorker = ResolvedCommon & {
    command?: string[];
    queues?: string[];
};

export type ResolvedLambda = ResolvedCommon & {
    triggeredBy: string[]; // ["s3","sqs"]
};

export type ResolvedFrontend = ResolvedCommon & {
    port: number;
    healthPath: string;
    tech: string; // "nextjs" | "react"
    env?: Record<string, string>;
    tenants?: Array<{
        tenant: string;
        subdomain: string;
        customSettings?: Record<string, any>;
    }>;
};

export type ResolvedConfig = {
    customer: string;
    environment: string;
    http: ResolvedHttp[];
    worker: ResolvedWorker[];
    lambda: ResolvedLambda[];
    frontend: ResolvedFrontend[];
};

/** ===== Bundles de policies (mantenha tudo aqui) ===== */
const policyBundles: Record<string, string[]> = {
    "bundle:laravel-min": [
        aws.iam.ManagedPolicy.SecretsManagerReadWrite,
    ],
    "bundle:laravel-full": [
        aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        aws.iam.ManagedPolicy.AmazonSQSFullAccess,
        aws.iam.ManagedPolicy.AmazonS3FullAccess,
        aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
        aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy,
    ],
    "bundle:laravel-s3-sqs": [
        aws.iam.ManagedPolicy.AmazonS3FullAccess,
        aws.iam.ManagedPolicy.AmazonSQSFullAccess,
    ],
    "bundle:go-min": [
        aws.iam.ManagedPolicy.SecretsManagerReadWrite,
    ],
    "bundle:nextjs-min": [
        aws.iam.ManagedPolicy.SecretsManagerReadWrite,
    ],
    "bundle:laravel-worker-email": [
        aws.iam.ManagedPolicy.AmazonSQSFullAccess,
        aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        aws.iam.ManagedPolicy.AmazonSESFullAccess,
        aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
        aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy,
    ],
    "bundle:laravel-worker-heavy": [
        aws.iam.ManagedPolicy.AmazonSQSFullAccess,
        aws.iam.ManagedPolicy.SecretsManagerReadWrite,
        aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
        aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy,
    ],
    "bundle:lambda-s3-full": [
        aws.iam.ManagedPolicy.AmazonS3FullAccess,
        aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
    ],
};

/** ===== Helpers ===== */
const deepMerge = <T extends object>(base: T, override: Partial<T>): T => {
    const result: any = { ...base };

    for (const [k, v] of Object.entries(override || {})) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
            result[k] = deepMerge(result[k] || {}, v as any);
        } else {
            result[k] = v;
        }
    }

    return result;
};

const uniq = <T>(arr: T[]) => Array.from(new Set(arr));

/** Expande bundles para ARNs; mantém ARNs/diretórios já explícitos */
const resolvePolicies = (policies?: string[]): string[] => {
    if (!policies || policies.length === 0) return [];

    const out: string[] = [];

    for (const p of policies) {
        if (p.startsWith("bundle:")) {
            out.push(...(policyBundles[p] || []));
        } else {
            out.push(p);
        }
    }

    return uniq(out);
};

/**
 * Deriva o nome do repo ECR baseado no stack/ambiente:
 * - stacks: "quest-staging-core", "quest-staging-services"
 * - padrão histórico: "<env>-services-<service>-repo"
 * Obs.: se quiser outro padrão, ajuste aqui centralmente.
 */
const deriveRepos = (opts: {
    stack: string;
    environment: string;
    serviceName: string; // "auth-service"
    sidecar?: boolean;
}) => {
    const env = opts.environment; // "staging" | "production" | ...
    // Heurística: se o stack contém "-services", segue <env>-services-<name>-repo
    const isServices = opts.stack.includes("-services");
    const base = isServices
        ? `${env}-services-${opts.serviceName}`
        : `${env}-core-${opts.serviceName}`;

    const imageRepo = `${base}-repo`;
    const nginxSidecarImageRepo = opts.sidecar ? `${base}-nginx-repo` : undefined;

    return { imageRepo, nginxSidecarImageRepo };
};

/** Decide default de nginxSidecar por tech */
const defaultSidecarForTech = (tech?: string): boolean => {
    // Laravel atrás de FPM normalmente usa NGINX sidecar.
    if (!tech) return true;
    if (tech.toLowerCase() === "laravel") return true;
    if (tech.toLowerCase() === "go") return false;

    return false;
};

/** Normaliza ECS defaults garantindo preenchimento */
const normalizeEcs = (ecs?: ECSDefaults, fallback?: ECSDefaults): Required<ECSDefaults> => {
    const base: Required<ECSDefaults> = {
        cpu: fallback?.cpu ?? 256,
        memory: fallback?.memory ?? 512,
        env: { ...(fallback?.env || {}) },
    };

    if (!ecs) return base;

    return {
        cpu: ecs.cpu ?? base.cpu,
        memory: ecs.memory ?? base.memory,
        env: { ...base.env, ...(ecs.env || {}) },
    };
};

/** Carrega JSON utilitário */
const loadJson = <T>(filePath: string): T => {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
};

export const resolveConfig = (params?: {
    basePath?: string;      // default: "configs/base.json"
    customerPath?: string;  // ex: "configs/customers/quest.staging.json"
}): ResolvedConfig => {
    const stack = pulumi.getStack();

    const baseFile = params?.basePath ?? path.join("configs", "base.json");
    const base = loadJson<BaseJson>(baseFile);

    const customerFile =
        params?.customerPath ??
        (() => {
            const m = stack.match(/^([a-z0-9-]+)-(staging|production)(?:-.+)?$/i);

            if (!m) {
                throw new Error(
                    `Não foi possível inferir customer e environment a partir do stack "${stack}". Passe customerPath explicitamente.`
                );
            }

            const [, customerSlug, env] = m;
            const guess = path.join("configs", "customers", `${customerSlug}.${env}.json`);

            if (!fs.existsSync(guess)) {
                throw new Error(`Arquivo de cliente não encontrado: ${guess}`);
            }

            return guess;
        })();

    const customer = loadJson<CustomerJson>(customerFile);

    /** 1) Base defaults (global por tipo) */
    const def = base.defaults || {};

    /** 2) Colete lista de serviços por tipo do base */
    const svcByKind = base.services || {};

    /** 3) Filtragem por enable/disable */
    const want = (name: string) => {
        const disabled = new Set(customer.disable || []);
        if (disabled.has(name)) return false;

        const en = customer.enable || [];
        if (en.includes("*")) return true;

        return en.includes(name);
    };

    type ServiceTypeMap = {
        http: ResolvedHttp;
        worker: ResolvedWorker;
        lambda: ResolvedLambda;
        frontend: ResolvedFrontend;
    };

    /** 4) Função que resolve um serviço (genérica por tipo) */
    const resolveOne = <K extends ServiceKind>(
        kind: ServiceKind,
        name: string,
        raw: any
    ): ServiceTypeMap[K] | null => {
        if (!want(name)) return null;

        // Merge chain (precedência incremental):
        // defaults.global(kind) -> base.services.kind[name] -> customer.overrides.global -> customer.overrides.kind[name]
        let merged: any = {};

        // 4.1 defaults do tipo (http/worker/lambda/frontend)
        if (def[kind]) merged = deepMerge(merged, def[kind] as any);

        // 4.2 defaults ECS globais (se existir)
        if (def.ecs) merged.ecs = deepMerge(merged.ecs || {}, def.ecs);

        // 4.3 config do serviço no base
        merged = deepMerge(merged, raw || {});

        // 4.4 overrides globais do customer (ecs/env)
        if (customer.overrides?.global) {
            if (customer.overrides.global.ecs) {
                merged.ecs = deepMerge(merged.ecs || {}, customer.overrides.global.ecs);
            }
            if (customer.overrides.global.env) {
                merged.ecs = merged.ecs || {};
                merged.ecs.env = { ...(merged.ecs.env || {}), ...customer.overrides.global.env };
            }
        }

        // 4.5 overrides do serviço no customer
        if ((customer.overrides as any)?.[kind]?.[name]) {
            merged = deepMerge(merged, (customer.overrides as any)[kind][name]);
        }

        // 5) Normalizações e derivados
        const environment = customer.environment;
        const ecs = normalizeEcs(merged.ecs, def.ecs);

        const tech = (merged.tech ??
            (kind === "http" ? "laravel" : kind === "frontend" ? "nextjs" : undefined)) as string | undefined;

        const nginxSidecar: boolean =
            typeof merged.nginxSidecar === "boolean" ? merged.nginxSidecar : defaultSidecarForTech(tech);

        const { imageRepo, nginxSidecarImageRepo } = deriveRepos({
            stack,
            environment,
            serviceName: name,
            sidecar: nginxSidecar,
        });

        // 6) Expansão de policies (bundles -> ARNs)
        const policies = resolvePolicies(merged.policies);

        // 7) Monta saída por tipo
        const common: ResolvedCommon = {
            name,
            kind,
            imageTag: merged.imageTag,
            ecs,
            policies,
            imageRepo,
            nginxSidecarImageRepo,
            nginxSidecar,
        };

        if (kind === "http") {
            const out: ResolvedHttp = {
                ...common,
                path: merged.path ?? name.replace(/-service$/, "").replace(/_/g, "-"),
                port: merged.port ?? def.http?.port ?? 9000,
                healthPath: merged.healthPath ?? def.http?.healthPath ?? "/health",
                tech: tech || "laravel",
            };

            return out as ServiceTypeMap[K];;
        }

        if (kind === "worker") {
            const out: ResolvedWorker = {
                ...common,
                command: merged.command,
                queues: merged.queues,
            };

            return out as ServiceTypeMap[K];
        }

        if (kind === "lambda") {
            const trig = merged.triggeredBy ?? def.lambda?.triggeredBy ?? [];
            const out: ResolvedLambda = {
                ...common,
                triggeredBy: Array.isArray(trig) ? trig : [trig],
            };

            return out as ServiceTypeMap[K];;
        }

        if (kind === "frontend") {
            const out: ResolvedFrontend = {
                ...common,
                port: merged.port ?? def.frontend?.port ?? 3000,
                healthPath: merged.healthPath ?? def.frontend?.healthPath ?? "/api/health",
                tech: tech || "nextjs",
                env: merged.env,
                tenants: merged.tenants,
            };
            return out as ServiceTypeMap[K];;
        }

        return null;
    };

    const http: ResolvedHttp[] = Object.entries(svcByKind.http || {})
        .map(([name, raw]) => resolveOne<"http">("http", name, raw))
        .filter(Boolean) as ResolvedHttp[];

    const worker: ResolvedWorker[] = Object.entries(svcByKind.worker || {})
        .map(([name, raw]) => resolveOne<"worker">("worker", name, raw))
        .filter(Boolean) as ResolvedWorker[];

    const lambda: ResolvedLambda[] = Object.entries(svcByKind.lambda || {})
        .map(([name, raw]) => resolveOne<"lambda">("lambda", name, raw))
        .filter(Boolean) as ResolvedLambda[];

    const frontend: ResolvedFrontend[] = Object.entries(svcByKind.frontend || {})
        .map(([name, raw]) => resolveOne<"frontend">("frontend", name, raw))
        .filter(Boolean) as ResolvedFrontend[];

    return {
        customer: customer.customer,
        environment: customer.environment,
        http,
        worker,
        lambda,
        frontend,
    };
};
