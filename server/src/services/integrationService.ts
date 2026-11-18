import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Quote } from "@quotation/shared";
import { deleteSetting, getSetting, setSetting } from "./settingsService.js";

/**
 * The restricted view of a quote that ever leaves the admin-only API: the same fields the
 * `!quote N` chat reply shows. Never includes who added/edited it.
 */
export interface PublicQuote {
  id: number;
  text: string;
  author: string;
  game: string | null;
  createdAt: string;
}

export function toPublicQuote(q: Quote): PublicQuote {
  return { id: q.id, text: q.text, author: q.author, game: q.game, createdAt: q.createdAt };
}

const KEY_HASH_SETTING = "integration_api_key_hash";
const PUBLIC_ENABLED_SETTING = "public_page_enabled";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Creates a new API key, stores only its hash, and returns the plaintext (shown once). */
export async function regenerateApiKey(): Promise<string> {
  const key = `qtn_${randomBytes(32).toString("hex")}`;
  await setSetting(KEY_HASH_SETTING, sha256(key).toString("hex"));
  return key;
}

export async function revokeApiKey(): Promise<void> {
  await deleteSetting(KEY_HASH_SETTING);
}

export async function hasApiKey(): Promise<boolean> {
  return Boolean(await getSetting(KEY_HASH_SETTING));
}

/** Constant-time check of a presented key against the stored hash. */
export async function verifyApiKey(presented: string): Promise<boolean> {
  const stored = await getSetting(KEY_HASH_SETTING);
  if (!stored || presented.length === 0 || presented.length > 256) return false;
  const expected = Buffer.from(stored, "hex");
  const actual = sha256(presented);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function isPublicPageEnabled(): Promise<boolean> {
  return (await getSetting(PUBLIC_ENABLED_SETTING)) === "true";
}

export async function setPublicPageEnabled(enabled: boolean): Promise<void> {
  await setSetting(PUBLIC_ENABLED_SETTING, enabled ? "true" : "false");
}
