import * as aws from "@pulumi/aws";
import { Output } from "@pulumi/pulumi";

export function ensureSecret(name: string, description?: string): aws.secretsmanager.Secret {
    return new aws.secretsmanager.Secret(name, {
        description: description ?? `Secret for ${name}`,
    });
}

export async function getSecretValue(secretName: string): Promise<string | undefined> {
    try {
        const secret = await aws.secretsmanager.getSecretVersion({ secretId: secretName });
        return secret.secretString;
    } catch {
        return undefined;
    }
}

export function createJsonSecret(name: string, data: Output<object>, description?: string) {
    const secret = ensureSecret(name);

    const secretString = data.apply(d => JSON.stringify(d));

    new aws.secretsmanager.SecretVersion(`${name}-version`, {
        secretId: secret.id,
        secretString: secretString,
    });

    return secret;
}
