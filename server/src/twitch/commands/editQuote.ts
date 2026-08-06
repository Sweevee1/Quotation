import { updateQuote } from "../../services/quotesService.js";
import { renderErrorTemplate } from "../../services/templateService.js";
import type { CommandContext } from "./types.js";

export async function runEditQuote(ctx: CommandContext): Promise<string> {
  const match = ctx.args.trim().match(/^(\d+)\s+([\s\S]+)$/);
  if (!match) {
    return "Usage: !editquote <id> <new text>";
  }
  const [, idStr, text] = match;
  const id = Number.parseInt(idStr, 10);

  const quote = await updateQuote(id, { text: text.trim(), editedBy: ctx.tags.username ?? "unknown" });
  if (!quote) {
    return renderErrorTemplate(ctx.config.errorTemplate, { id: idStr });
  }
  return `Quote #${quote.id} updated.`;
}
