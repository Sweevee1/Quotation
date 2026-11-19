import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// server/src/config or server/dist/config -> repo root is 3 levels up either way. Dev convenience only.
dotenv.config({ path: path.join(import.meta.dirname, "../../../.env"), quiet: true });

const num = (v: string | undefined, fallback: number) => (v && /^\d+$/.test(v) ? Number(v) : fallback);

const DATA_DIR = process.env.DATA_DIR || "./data";

/**
 * Session/encryption secret. Zero-config: generated once and kept in DATA_DIR/.session-secret.
 * A SESSION_SECRET env var (installs that already set one) wins, and is copied to the file so
 * removing the variable later keeps the same secret (and keeps stored Twitch credentials readable).
 */
function loadSessionSecret(): string {
  const file = path.join(DATA_DIR, ".session-secret");
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(file, fromEnv, { mode: 0o600 });
    }
    return fromEnv;
  }
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const generated = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: num(process.env.PORT, 8766),
  DATA_DIR,
  SESSION_SECRET: loadSessionSecret(),
  // Trust X-Forwarded-* only from private/loopback peers (Cloudflare Tunnel, LAN/Docker proxy);
  // a public address connecting directly can't spoof its IP to dodge the login rate limit.
  TRUST_PROXY: "loopback,linklocal,uniquelocal",
};
