import { count, eq, like, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { quotes } from "../db/schema.js";
import type { Quote, QuoteCreateInput, QuoteUpdateInput } from "@quotation/shared";

function nowIso(): string {
  return new Date().toISOString();
}

export async function createQuote(input: QuoteCreateInput, defaultAuthor: string): Promise<Quote> {
  const result = await db
    .insert(quotes)
    .values({
      text: input.text,
      author: input.author?.trim() || defaultAuthor,
      game: input.game ?? null,
      createdAt: input.createdAt ?? nowIso(),
      addedBy: input.addedBy,
    })
    .returning()
    .get();
  return result as Quote;
}

export async function getQuoteById(id: number): Promise<Quote | undefined> {
  return (await db.select().from(quotes).where(eq(quotes.id, id)).get()) as Quote | undefined;
}

export async function getRandomQuote(): Promise<Quote | undefined> {
  return (await db.select().from(quotes).orderBy(sql`RANDOM()`).limit(1).get()) as
    | Quote
    | undefined;
}

export async function updateQuote(id: number, input: QuoteUpdateInput): Promise<Quote | undefined> {
  const setValues: Partial<typeof quotes.$inferInsert> = {
    editedAt: nowIso(),
    editedBy: input.editedBy,
  };
  if (input.text !== undefined) setValues.text = input.text;
  if (input.author !== undefined) setValues.author = input.author;
  if (input.game !== undefined) setValues.game = input.game;
  if (input.createdAt !== undefined) setValues.createdAt = input.createdAt;

  // Uses .all() rather than .get(): with 0 matching rows, .get() throws on this driver
  // instead of resolving to undefined, which would otherwise crash the caller silently.
  const rows = await db
    .update(quotes)
    .set(setValues)
    .where(eq(quotes.id, id))
    .returning()
    .all();
  return rows[0] as Quote | undefined;
}

export async function deleteQuote(id: number): Promise<boolean> {
  const result = await db.delete(quotes).where(eq(quotes.id, id)).run();
  return result.rowsAffected > 0;
}

export async function countQuotes(): Promise<number> {
  const row = await db.select({ value: count() }).from(quotes).get();
  return row?.value ?? 0;
}

export interface ListQuotesOptions {
  search?: string;
  page: number;
  pageSize: number;
}

export async function listQuotes(options: ListQuotesOptions): Promise<{ items: Quote[]; total: number }> {
  const { search, page, pageSize } = options;
  const whereClause = search
    ? or(like(quotes.text, `%${search}%`), like(quotes.author, `%${search}%`))
    : undefined;

  const items = (await db
    .select()
    .from(quotes)
    .where(whereClause)
    .orderBy(sql`${quotes.id} DESC`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()) as Quote[];

  const totalRow = await db.select({ value: count() }).from(quotes).where(whereClause).get();

  return { items, total: totalRow?.value ?? 0 };
}

/** Full unpaginated dump, ordered by id — used for backup/restore between deployments. */
export async function exportAllQuotes(): Promise<Quote[]> {
  return (await db.select().from(quotes).orderBy(sql`${quotes.id} ASC`).all()) as Quote[];
}

export interface QuoteImportItem {
  id?: number;
  text: string;
  author: string;
  game?: string | null;
  createdAt?: string;
  addedBy?: string;
}

/**
 * Bulk-loads quotes, preserving explicit ids where given (upserting on conflict) so a quote
 * exported as #42 imports back in as #42 — chat references to specific IDs keep working.
 */
export async function importQuotes(items: QuoteImportItem[]): Promise<{ imported: number }> {
  for (const item of items) {
    const values = {
      ...(item.id !== undefined ? { id: item.id } : {}),
      text: item.text,
      author: item.author,
      game: item.game ?? null,
      createdAt: item.createdAt ?? nowIso(),
      addedBy: item.addedBy ?? "import",
    };
    if (item.id !== undefined) {
      await db
        .insert(quotes)
        .values(values)
        .onConflictDoUpdate({ target: quotes.id, set: values })
        .run();
    } else {
      await db.insert(quotes).values(values).run();
    }
  }
  return { imported: items.length };
}
