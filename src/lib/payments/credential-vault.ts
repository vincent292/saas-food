import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function vaultKey() {
  const value = process.env.BANK_CREDENTIALS_KEY?.trim();
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("bank-vault-not-configured");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("bank-vault-not-configured");
  return key;
}

export function bankVaultConfigured() {
  try { vaultKey(); return true; } catch { return false; }
}

function aad(connectionId: string, restaurantId: string, environment: string) {
  return Buffer.from(`baneco:v1:${connectionId}:${restaurantId}:${environment}`, "utf8");
}

export function sealBankCredentials(value: unknown, connectionId: string, restaurantId: string, environment: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(aad(connectionId, restaurantId, environment));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

export function openBankCredentials(value: string, connectionId: string, restaurantId: string, environment: string): unknown {
  const [version, encodedIv, encodedTag, encodedBody, extra] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedBody || extra) throw new Error("bank-vault-unreadable");
  try {
    const iv = Buffer.from(encodedIv, "base64"), tag = Buffer.from(encodedTag, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("invalid-envelope");
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), iv);
    decipher.setAAD(aad(connectionId, restaurantId, environment));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encodedBody, "base64")), decipher.final()]).toString("utf8"));
  } catch { throw new Error("bank-vault-unreadable"); }
}
