import { getQuoteById, getRandomQuote } from "../../services/quotesService.js";
import { renderErrorTemplate, renderQuoteTemplate } from "../../services/templateService.js";
import type { CommandContext } from "./types.js";

export async function runQuote(ctx: CommandContext): Promise<string> {
  const arg = ctx.args.trim();

  if (!arg) {
    const quote = await getRandomQuote();
    if (!quote) return "No quotes saved yet.";
    return renderQuoteTemplate(ctx.config.responseTemplate, quote);
  }

  const id = Number.parseInt(arg, 10);
  if (!Number.isFinite(id)) {
    return "Usage: !quote [id]";
  }

  const quote = await getQuoteById(id);
  if (!quote) {
    return renderErrorTemplate(ctx.config.errorTemplate, { id: arg });
  }
  return renderQuoteTemplate(ctx.config.responseTemplate, quote);
}
