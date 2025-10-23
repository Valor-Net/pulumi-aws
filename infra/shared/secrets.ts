import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";


// Cache para evitar criação duplicada de secrets
const secretCache = new Map<string, aws.secretsmanager.Secret>();

export function ensureJsonSecretWithDefault(
    logicalName: string,
    defaultValue: any,
    description?: string
): aws.secretsmanager.Secret {
    if (secretCache.has(logicalName)) {
        return secretCache.get(logicalName)!;
    }

    const secret = new aws.secretsmanager.Secret(logicalName, {
        name: logicalName,
        description: description ?? `Secret for ${logicalName}`,
    });

    new aws.secretsmanager.SecretVersion(
        `${logicalName}-initial`,
        {
            secretId: secret.id,
            secretString: JSON.stringify(defaultValue),
        },
        {
            deleteBeforeReplace: false,
        },
    );

    // Adiciona no cache
    secretCache.set(logicalName, secret);
    return secret;
}

export function getSecretString(
    secretId: pulumi.Input<string>,
    dependsOn: pulumi.Resource
): pulumi.Output<string> {
    return pulumi.output(
        aws.secretsmanager.getSecretVersionOutput(
            { secretId },
            { dependsOn }
        )
    ).apply(v => v.secretString!);
}

export function ensureSecret(name: string, description?: string): aws.secretsmanager.Secret {
    if (secretCache.has(name)) {
        return secretCache.get(name)!;
    }

    const secret = new aws.secretsmanager.Secret(name, {
        name,
        description: description ?? `Secret for ${name}`,
    });

    secretCache.set(name, secret);
    return secret;
}

export function getSecretValueOutput(secretName: pulumi.Input<string>): pulumi.Output<string | undefined> {
    return pulumi.output(secretName).apply(sn =>
        aws.secretsmanager.getSecretVersionOutput({ secretId: sn }).apply(sv => sv.secretString)
    );
}

export function createJsonSecret(name: string, data: pulumi.Output<object>, description?: string) {
    const secret = ensureSecret(name);

    const secretString = data.apply(d => JSON.stringify(d));

    new aws.secretsmanager.SecretVersion(`${name}-version`, {
        secretId: secret.id,
        secretString: secretString,
    });

    return secret;
}

export function ensureTextSecret(name: string, value: pulumi.Input<string>) {
    if (secretCache.has(name)) {
        return secretCache.get(name)!;
    }

    const secret = new aws.secretsmanager.Secret(name, {name});
    new aws.secretsmanager.SecretVersion(`${name}-v`, {
        secretId: secret.id,
        secretString: value,
    });

    secretCache.set(name, secret);
    return secret;
}

export function getKeyFromSecretsOrFile(secretName: string, filePath: string): string {
    const envValue = process.env[secretName];
    if (envValue) {
        return envValue;
    }
    
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (error) {
        throw new Error(`${secretName} environment variable is required for CI/CD or ${filePath} file for local development`);
    }
}

export function createManagedSecret(name: string, initialValue: any, description: string): aws.secretsmanager.Secret {
    if (secretCache.has(name)) {
        return secretCache.get(name)!;
    }

    const secret = new aws.secretsmanager.Secret(name, {
        name: name,
        description: description,
    });

    new aws.secretsmanager.SecretVersion(`${name}-version`, {
        secretId: secret.id,
        secretString: JSON.stringify(initialValue),
    }, {
        ignoreChanges: ["secretString"],
        dependsOn: [secret]
    });

    secretCache.set(name, secret);
    return secret;
}

