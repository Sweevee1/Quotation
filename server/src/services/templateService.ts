import type { Quote } from "@quotation/shared";

/** Renders a response template like "Quote #{id}: {text} - {author} [{game}] [{date}]". */
export function renderQuoteTemplate(template: string, quote: Quote): string {
  const date = new Date(quote.createdAt);
  const formattedDate = Number.isNaN(date.getTime())
    ? quote.createdAt
    : date.toLocaleDateString("en-US");

  return template
    .replaceAll("{id}", String(quote.id))
    .replaceAll("{text}", quote.text)
    .replaceAll("{author}", quote.author)
    .replaceAll("{game}", quote.game ?? "Unknown")
    .replaceAll("{date}", formattedDate);
}

export function renderErrorTemplate(template: string, vars: Record<string, string> = {}): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
