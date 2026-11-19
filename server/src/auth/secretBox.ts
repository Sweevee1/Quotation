import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

// AES-256-GCM with a key derived from SESSION_SECRET, so a copy of the SQLite file / backup alone
// doesn't reveal Twitch secrets. Rotating SESSION_SECRET makes them undecryptable (re-enter/re-auth).
const PREFIX = "enc:v1:";
const key = Buffer.from(hkdfSync("sha256", env.SESSION_SECRET, "quotation-settings", "secretbox", 32));

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Returns undefined if the value can't be decrypted (wrong/rotated key, tampering). */
export function decryptSecret(value: string): string | undefined {
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), "base64");
    const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}
