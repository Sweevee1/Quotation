import type { CommandName } from "@quotation/shared";
import { logger } from "../logger.js";
import { getSetting, resolveCommandByWord } from "../services/settingsService.js";
import { publishEvent } from "../events/bus.js";
import { checkCooldown, recordRun } from "./cooldowns.js";
import { hasPermission, resolveBadgeRole, type ChatTags } from "./permissions.js";
import { runAddQuote } from "./commands/addQuote.js";
import { runQuote } from "./commands/quote.js";
import { runEditQuote } from "./commands/editQuote.js";
import { runRemoveQuote } from "./commands/removeQuote.js";
import type { CommandContext } from "./commands/types.js";

const HANDLERS: Record<CommandName, (ctx: CommandContext) => Promise<string>> = {
  addquote: runAddQuote,
  quote: runQuote,
  editquote: runEditQuote,
  removequote: runRemoveQuote,
};

export type ChatReply = (message: string) => Promise<void>;

/**
 * Parses and dispatches a single chat message. No-ops silently for anything that
 * isn't a recognized (and enabled) quote command — this bot only owns quote commands.
 */
export async function handleChatMessage(
  rawMessage: string,
  tags: ChatTags,
  reply: ChatReply,
): Promise<void> {
  if (!rawMessage.startsWith("!")) return;

  const spaceIdx = rawMessage.indexOf(" ");
  const word = spaceIdx === -1 ? rawMessage.slice(1) : rawMessage.slice(1, spaceIdx);
  const args = spaceIdx === -1 ? "" : rawMessage.slice(spaceIdx + 1).trim();

  const config = await resolveCommandByWord(word);
  if (!config || !config.enabled) return;

  const channelLogin = await getSetting("twitch_channel");
  if (!channelLogin) return;

  const username = tags.username ?? "unknown";

  const allowed = await hasPermission(tags, config.permissionLevel, channelLogin);
  if (!allowed) {
    publishEvent(
      "permission_denied",
      `${username} tried !${config.commandName} (requires ${config.permissionLevel})`,
    );
    return;
  }

  const badgeRole = resolveBadgeRole(tags, channelLogin);
  const bypassCooldown = config.modsBypassCooldown && (badgeRole === "moderator" || badgeRole === "broadcaster");

  if (!bypassCooldown) {
    const cooldown = checkCooldown(
      config.commandName,
      username,
      config.cooldownGlobalSec,
      config.cooldownUserSec,
    );
    if (!cooldown.allowed) {
      publishEvent("cooldown_skipped", `!${config.commandName} skipped (${cooldown.reason} cooldown)`);
      return;
    }
  }

  try {
    const handler = HANDLERS[config.commandName];
    const responseText = await handler({ args, tags, channelLogin, config });
    recordRun(config.commandName, username);
    await reply(responseText);
    publishEvent("command", `${username} ran !${config.commandName}${args ? ` ${args}` : ""}`);
  } catch (err) {
    logger.error({ err, command: config.commandName }, "Command handler failed");
    publishEvent("error", `!${config.commandName} failed — check server logs`);
  }
}
