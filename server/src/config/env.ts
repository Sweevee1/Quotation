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
  PUBLIC_URL: z.string().url().optional(),
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
});

export const env = envSchema.parse(process.env);
