import { createQuote } from "../../services/quotesService.js";
import { renderQuoteTemplate } from "../../services/templateService.js";
import { getCurrentGame, getUserProfile } from "../helixClient.js";
import type { CommandContext } from "./types.js";

export async function runAddQuote(ctx: CommandContext): Promise<string> {
  const text = ctx.args.trim();
  if (!text) {
    return "Usage: !addquote <text>";
  }

  const [game, streamerProfile] = await Promise.all([
    getCurrentGame(ctx.channelLogin),
    getUserProfile(ctx.channelLogin),
  ]);
  // Falls back to the raw channel setting (whatever casing the user typed in Settings) if the
  // Helix lookup fails — the default author should otherwise match Twitch's own capitalization
  // of the streamer's display name, not the all-lowercase IRC login.
  const quote = await createQuote(
    { text, addedBy: ctx.tags.username ?? "unknown", game },
    streamerProfile?.displayName ?? ctx.channelLogin,
  );

  return `Added ${renderQuoteTemplate(ctx.config.responseTemplate, quote)}`;
}
