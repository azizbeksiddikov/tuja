import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for secrets at rest (Plaid access tokens). Format: v1.<iv>.<tag>.<ciphertext> (base64url).
// Key: ENCRYPTION_KEY (32 bytes as base64/hex, or any passphrase -> SHA-256), else derived from
// BETTER_AUTH_SECRET. Production refuses to run without one of them.

function keyBytes(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || "";
  if (raw) {
    if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
    const b = Buffer.from(raw, "base64");
    if (b.length === 32 && raw.length >= 43) return b;
    return createHash("sha256").update(raw).digest();
  }
  const fallback = process.env.BETTER_AUTH_SECRET;
  if (fallback) return createHash("sha256").update(`tuja-token-encryption:${fallback}`).digest();
  if (process.env.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY (or BETTER_AUTH_SECRET) must be set");
  return createHash("sha256").update("tuja-dev-only-key").digest();
}

export function encrypt(plain: string, key: Buffer = keyBytes()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string, key: Buffer = keyBytes()): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Bad ciphertext format");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
