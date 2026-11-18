import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { quoteBackups, quotes } from "../db/schema.js";
import { exportAllQuotes, type QuoteImportItem } from "./quotesService.js";
import type { BackupTrigger, Quote, QuoteBackupSummary } from "@quotation/shared";
import { logger } from "../logger.js";

const MAX_BACKUPS = 7;

/** A backup's stored quote shape — unlike the live `Quote` type, `id` may be absent (e.g. a
 * freshly uploaded file with no ids yet), in which case restore lets SQLite assign fresh ones. */
type BackupQuoteItem = Omit<Quote, "id"> & { id?: number };

function nowIso(): string {
  return new Date().toISOString();
}

function toSummary(row: typeof quoteBackups.$inferSelect): QuoteBackupSummary {
  return {
    id: row.id,
    createdAt: row.createdAt,
    trigger: row.trigger as BackupTrigger,
    quoteCount: row.quoteCount,
  };
}

/** Deletes backups beyond the newest MAX_BACKUPS, oldest first. */
async function pruneOldBackups(): Promise<void> {
  const rows = await db
    .select({ id: quoteBackups.id })
    .from(quoteBackups)
    .orderBy(desc(quoteBackups.id))
    .all();
  const toDelete = rows.slice(MAX_BACKUPS);
  for (const row of toDelete) {
    await db.delete(quoteBackups).where(eq(quoteBackups.id, row.id)).run();
  }
}

async function insertBackup(trigger: BackupTrigger, items: BackupQuoteItem[]): Promise<QuoteBackupSummary> {
  const rows = await db
    .insert(quoteBackups)
    .values({
      createdAt: nowIso(),
      trigger,
      quoteCount: items.length,
      data: JSON.stringify(items),
    })
    .returning()
    .all();
  const created = rows[0];
  await pruneOldBackups();
  logger.info({ trigger, quoteCount: items.length, backupId: created.id }, "Quote backup created");
  return toSummary(created);
}

export async function createBackup(trigger: BackupTrigger): Promise<QuoteBackupSummary> {
  const items = await exportAllQuotes();
  return insertBackup(trigger, items);
}

/**
 * Stores an uploaded backup file's quotes as a new backup entry — doesn't touch live quotes.
 * Takes an 'pre_restore' snapshot of the current live quotes first, so that safety backup's
 * timestamp is earlier than the imported entry's, ahead of it in the list, reflecting that it
 * captures state from before the import rather than being the import itself.
 */
export async function importBackup(items: QuoteImportItem[]): Promise<QuoteBackupSummary> {
  await createBackup("pre_restore");

  const normalized: BackupQuoteItem[] = items.map((item) => ({
    ...(item.id !== undefined ? { id: item.id } : {}),
    text: item.text,
    author: item.author,
    game: item.game ?? null,
    createdAt: item.createdAt ?? nowIso(),
    addedBy: item.addedBy ?? "import",
    editedAt: null,
    editedBy: null,
  }));
  return insertBackup("import", normalized);
}

export async function listBackups(): Promise<QuoteBackupSummary[]> {
  const rows = await db
    .select()
    .from(quoteBackups)
    .orderBy(desc(quoteBackups.id))
    .all();
  return rows.map(toSummary);
}

export async function getBackupData(id: number): Promise<BackupQuoteItem[] | undefined> {
  const row = await db.select().from(quoteBackups).where(eq(quoteBackups.id, id)).get();
  if (!row) return undefined;
  return JSON.parse(row.data) as BackupQuoteItem[];
}

/**
 * Fully replaces the live quotes table with a backup snapshot, preserving original ids.
 * Takes a 'pre_restore' safety snapshot of the current state first, so an accidental or
 * wrong-choice restore can itself be undone — unless `skipSafetyBackup` is set, for callers
 * (the "import, then immediately restore" flow) that already took one moments earlier and
 * would otherwise end up with two near-identical snapshots eating into the 7-backup rotation.
 */
export async function restoreBackup(
  id: number,
  options: { skipSafetyBackup?: boolean } = {},
): Promise<{ restoredCount: number; safetyBackupId: number | null }> {
  const items = await getBackupData(id);
  if (!items) {
    throw new Error("Backup not found");
  }

  const safety = options.skipSafetyBackup ? null : await createBackup("pre_restore");

  // One transaction: a failing insert rolls back the delete instead of leaving the table empty.
  await db.transaction(async (tx) => {
    await tx.delete(quotes).run();
    for (const item of items) {
      await tx
        .insert(quotes)
        .values({
          ...(item.id !== undefined ? { id: item.id } : {}),
          text: item.text,
          author: item.author,
          game: item.game,
          createdAt: item.createdAt,
          addedBy: item.addedBy,
          editedAt: item.editedAt,
          editedBy: item.editedBy,
        })
        .run();
    }
  });

  // AUTOINCREMENT's sqlite_sequence counter tracks the highest id ever inserted and doesn't
  // drop when rows are deleted, so without this the next plain (id-less) insert would resume
  // from wherever the counter was pre-restore rather than from the restored data's actual max
  // id — silently skipping ahead and leaving a permanent gap in quote numbering.
  const maxId = items.reduce((max, item) => Math.max(max, item.id ?? 0), 0);
  await db.run(sql`UPDATE sqlite_sequence SET seq = ${maxId} WHERE name = 'quotes'`);

  logger.info({ backupId: id, restoredCount: items.length }, "Quotes restored from backup");
  return { restoredCount: items.length, safetyBackupId: safety?.id ?? null };
}
