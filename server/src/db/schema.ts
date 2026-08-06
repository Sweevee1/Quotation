import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const quotes = sqliteTable("quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  author: text("author").notNull(),
  game: text("game"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  addedBy: text("added_by").notNull(),
  editedAt: text("edited_at"),
  editedBy: text("edited_by"),
});

export const commandSettings = sqliteTable("command_settings", {
  commandName: text("command_name").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  permissionLevel: text("permission_level").notNull(),
  /** JSON-encoded string[] of extra chat aliases for this command. */
  aliases: text("aliases").notNull().default("[]"),
  cooldownGlobalSec: integer("cooldown_global_sec").notNull().default(0),
  cooldownUserSec: integer("cooldown_user_sec").notNull().default(0),
  modsBypassCooldown: integer("mods_bypass_cooldown", { mode: "boolean" })
    .notNull()
    .default(true),
  responseTemplate: text("response_template").notNull(),
  errorTemplate: text("error_template").notNull(),
});

/** Single-row-per-key config store for everything that isn't a quote or command config. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const quoteBackups = sqliteTable("quote_backups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  /** 'manual' | 'stream_start' | 'pre_restore' */
  trigger: text("trigger").notNull(),
  quoteCount: integer("quote_count").notNull(),
  /** JSON-encoded Quote[] snapshot at backup time. */
  data: text("data").notNull(),
});
