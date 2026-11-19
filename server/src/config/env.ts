import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// server/src/config or server/dist/config -> repo root is 3 levels up either way.
dotenv.config({ path: path.join(import.meta.dirname, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8766),
  DATA_DIR: z.string().min(1).default("./data"),
  WEBUI_PASSWORD: z.string().min(1).default("change-me"),
  SESSION_SECRET: z.string().min(1).default("dev-only-insecure-secret"),
  /**
   * Optional override for the externally-visible base URL (e.g. "https://1.2.3.4:8766"),
   * used to build the Twitch OAuth redirect URI. If unset, it's auto-detected from the
   * incoming request's protocol/host (respecting X-Forwarded-Proto behind a reverse proxy).
   */
  PUBLIC_URL: z.url().optional(),
  /**
   * Optional port for a bundled self-signed HTTPS listener, serving the same app as PORT.
   * Twitch requires the OAuth redirect URI to be HTTPS for anything but literal "localhost" —
   * deployments with no TLS-terminating reverse proxy in front (e.g. reached directly by LAN
   * IP, like most Unraid installs) have no other way to satisfy that. Set this, expose the
   * port, set PUBLIC_URL to "https://<host>:<TLS_PORT>", and register that as the Twitch
   * redirect URI; the browser will show a one-time untrusted-certificate warning to click
   * through during authorization. Leave unset if you already have real HTTPS (e.g. via a
   * reverse proxy) — PUBLIC_URL then points at that instead.
   */
  /**
   * Optional port for a second listener that serves ONLY the public quotes page
   * (/public/quotes). Forward or tunnel this port instead of PORT to publish the quotes
   * without exposing the admin UI. Leave unset to serve it on PORT only.
   */
  PUBLIC_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  TLS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  /**
   * Which peers' X-Forwarded-* headers to trust. Unset = zero-config default: trust them only when
   * the connecting peer is a private/loopback address (a Cloudflare Tunnel, Docker/LAN reverse proxy),
   * never when a public address connects directly, so a client can't spoof its IP to dodge the login
   * rate limit. Express then takes the first untrusted address from the right as the client IP.
   * Override with a hop count ("1") or an Express trust-proxy list if you need something stricter.
   */
  TRUST_PROXY: z
    .string()
    .default("loopback,linklocal,uniquelocal")
    .transform((v) => (/^\d+$/.test(v) ? Number(v) : v)),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production") {
  const weakSecrets = ["dev-only-insecure-secret", "change-me-too", "change-me"];
  if (weakSecrets.includes(env.SESSION_SECRET) || env.SESSION_SECRET.length < 32) {
    console.error("Refusing to start: set SESSION_SECRET to a random value of at least 32 characters.");
    process.exit(1);
  }
  if (env.WEBUI_PASSWORD === "change-me") {
    console.error('Refusing to start: WEBUI_PASSWORD is still the default "change-me".');
    process.exit(1);
  }
}
