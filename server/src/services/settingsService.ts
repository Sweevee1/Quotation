import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { commandSettings, settings } from "../db/schema.js";
import type { CommandConfig, CommandName } from "@quotation/shared";
import { hashPassword } from "../auth/password.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

function rowToCommandConfig(row: typeof commandSettings.$inferSelect): CommandConfig {
  return {
    commandName: row.commandName as CommandName,
    enabled: row.enabled,
    permissionLevel: row.permissionLevel as CommandConfig["permissionLevel"],
    aliases: JSON.parse(row.aliases) as string[],
    cooldownGlobalSec: row.cooldownGlobalSec,
    cooldownUserSec: row.cooldownUserSec,
    modsBypassCooldown: row.modsBypassCooldown,
    responseTemplate: row.responseTemplate,
    errorTemplate: row.errorTemplate,
  };
}

export async function getAllCommandConfigs(): Promise<CommandConfig[]> {
  const rows = await db.select().from(commandSettings).all();
  return rows.map(rowToCommandConfig);
}

/** Resolves a chat word (e.g. "quote" or a configured alias) to its canonical command config. */
export async function resolveCommandByWord(word: string): Promise<CommandConfig | undefined> {
  const lower = word.toLowerCase();
  const configs = await getAllCommandConfigs();
  for (const config of configs) {
    if (config.commandName === lower || config.aliases.some((a) => a.toLowerCase() === lower)) {
      return config;
    }
  }
  return undefined;
}

export async function updateCommandConfig(
  commandName: CommandName,
  patch: Partial<Omit<CommandConfig, "commandName">>,
): Promise<CommandConfig> {
  const updateValues: Partial<typeof commandSettings.$inferInsert> = {};
  if (patch.enabled !== undefined) updateValues.enabled = patch.enabled;
  if (patch.permissionLevel !== undefined) updateValues.permissionLevel = patch.permissionLevel;
  if (patch.aliases !== undefined) updateValues.aliases = JSON.stringify(patch.aliases);
  if (patch.cooldownGlobalSec !== undefined) updateValues.cooldownGlobalSec = patch.cooldownGlobalSec;
  if (patch.cooldownUserSec !== undefined) updateValues.cooldownUserSec = patch.cooldownUserSec;
  if (patch.modsBypassCooldown !== undefined) updateValues.modsBypassCooldown = patch.modsBypassCooldown;
  if (patch.responseTemplate !== undefined) updateValues.responseTemplate = patch.responseTemplate;
  if (patch.errorTemplate !== undefined) updateValues.errorTemplate = patch.errorTemplate;

  const row = await db
    .update(commandSettings)
    .set(updateValues)
    .where(eq(commandSettings.commandName, commandName))
    .returning()
    .get();
  return rowToCommandConfig(row);
}

const DEFAULT_RESPONSE_TEMPLATE =
  "Quote #{id}: {text} - {author} [{game}] [{date}]";
const DEFAULT_ERROR_TEMPLATE = "Quote not found.";

const DEFAULT_COMMANDS: Record<
  CommandName,
  Pick<
    CommandConfig,
    "permissionLevel" | "aliases" | "cooldownGlobalSec" | "cooldownUserSec"
  >
> = {
  addquote: {
    permissionLevel: "moderator",
    aliases: [],
    cooldownGlobalSec: 0,
    cooldownUserSec: 0,
  },
  quote: {
    permissionLevel: "everyone",
    aliases: [],
    cooldownGlobalSec: 5,
    cooldownUserSec: 0,
  },
  editquote: {
    permissionLevel: "moderator",
    aliases: [],
    cooldownGlobalSec: 0,
    cooldownUserSec: 0,
  },
  removequote: {
    permissionLevel: "moderator",
    aliases: ["delquote"],
    cooldownGlobalSec: 0,
    cooldownUserSec: 0,
  },
};

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key)).run();
}

/** Seeds first-run defaults: WebUI password hash and per-command config rows. */
export async function ensureBootstrap(): Promise<void> {
  if (!(await getSetting("webui_password_hash"))) {
    const hash = await hashPassword(env.WEBUI_PASSWORD);
    await setSetting("webui_password_hash", hash);
    logger.info(
      "Seeded WebUI password from WEBUI_PASSWORD env var — change it from the Settings page.",
    );
  }

  for (const [commandName, defaults] of Object.entries(DEFAULT_COMMANDS) as [
    CommandName,
    (typeof DEFAULT_COMMANDS)[CommandName],
  ][]) {
    const existing = await db
      .select()
      .from(commandSettings)
      .where(eq(commandSettings.commandName, commandName))
      .get();
    if (existing) continue;

    await db
      .insert(commandSettings)
      .values({
        commandName,
        enabled: true,
        permissionLevel: defaults.permissionLevel,
        aliases: JSON.stringify(defaults.aliases),
        cooldownGlobalSec: defaults.cooldownGlobalSec,
        cooldownUserSec: defaults.cooldownUserSec,
        modsBypassCooldown: true,
        responseTemplate: DEFAULT_RESPONSE_TEMPLATE,
        errorTemplate: DEFAULT_ERROR_TEMPLATE,
      })
      .run();
    logger.info({ commandName }, "Seeded default command config");
  }
}
