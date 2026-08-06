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
});

export const env = envSchema.parse(process.env);
