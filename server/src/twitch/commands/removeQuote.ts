import { deleteQuote } from "../../services/quotesService.js";
import { renderErrorTemplate } from "../../services/templateService.js";
import type { CommandContext } from "./types.js";

export async function runRemoveQuote(ctx: CommandContext): Promise<string> {
  const arg = ctx.args.trim();
  const id = Number.parseInt(arg, 10);
  if (!Number.isFinite(id)) {
    return "Usage: !removequote <id>";
  }

  const removed = await deleteQuote(id);
  if (!removed) {
    return renderErrorTemplate(ctx.config.errorTemplate, { id: arg });
  }
  return `Quote #${id} removed.`;
}
