import { z } from "zod";
import { COMMAND_NAMES, ROLES } from "./types.js";

export const roleSchema = z.enum([...ROLES]);
export const commandNameSchema = z.enum([...COMMAND_NAMES]);

export const loginSchema = z.object({
  password: z.string().min(1),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const quoteCreateSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  author: z.string().trim().max(100).optional(),
  game: z.string().trim().max(200).nullable().optional(),
  /** ISO date-time string for when the quote was said. Defaults to now if omitted. */
  createdAt: z.string().trim().min(1).optional(),
});

export const quoteUpdateSchema = z
  .object({
    text: z.string().trim().min(1).max(2000).optional(),
    author: z.string().trim().max(100).optional(),
    game: z.string().trim().max(200).nullable().optional(),
    createdAt: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export const quoteImportItemSchema = z.object({
  id: z.number().int().nonnegative().optional(),
  text: z.string().trim().min(1).max(2000),
  author: z.string().trim().min(1).max(200),
  game: z.string().trim().max(200).nullable().optional(),
  createdAt: z.string().trim().min(1).optional(),
  addedBy: z.string().trim().max(100).optional(),
});

export const quoteImportSchema = z.object({
  quotes: z.array(quoteImportItemSchema).min(1).max(5000),
});

export const quoteListQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const commandConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  permissionLevel: roleSchema.optional(),
  aliases: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  cooldownGlobalSec: z.number().int().min(0).max(86400).optional(),
  cooldownUserSec: z.number().int().min(0).max(86400).optional(),
  modsBypassCooldown: z.boolean().optional(),
  responseTemplate: z.string().trim().min(1).max(500).optional(),
  errorTemplate: z.string().trim().min(1).max(500).optional(),
});

export const twitchSettingsUpdateSchema = z.object({
  channel: z.string().trim().min(1).max(50).optional(),
  clientId: z.string().trim().min(1).max(100).optional(),
  clientSecret: z.string().trim().min(1).max(100).optional(),
});
