import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import * as schema from "./schema.js";

if (!existsSync(env.DATA_DIR)) {
  mkdirSync(env.DATA_DIR, { recursive: true });
}

const dbPath = path.join(env.DATA_DIR, "quotation.db");
const client = createClient({ url: `file:${dbPath}` });
await client.execute("PRAGMA journal_mode = WAL");

export const db = drizzle(client, { schema });

/** Runs pending Drizzle migrations. Safe to call on every boot. */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.join(import.meta.dirname, "migrations");
  if (!existsSync(migrationsFolder)) {
    logger.warn(
      { migrationsFolder },
      "No migrations folder found — skipping migration step",
    );
    return;
  }
  await migrate(db, { migrationsFolder });
  logger.info("Database migrations applied");
}
