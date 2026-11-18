import { Router } from "express";
import { z } from "zod";
import { countQuotes, getQuoteById, listQuotes } from "../services/quotesService.js";
import { getSetting } from "../services/settingsService.js";
import { toPublicQuote } from "../services/integrationService.js";
import { requireApiKey } from "../middleware/requireApiKey.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Machine API for linked apps (SweevElements). Authenticated by an API key, not the WebUI
 * session, and read-only. Everything returned goes through toPublicQuote().
 */
export const integrationRouter = Router();
integrationRouter.use(rateLimit("integration", 120));
integrationRouter.use(requireApiKey);

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

integrationRouter.get(
  "/ping",
  asyncHandler(async (_req, res) => {
    const [channel, count] = await Promise.all([getSetting("twitch_channel"), countQuotes()]);
    res.json({ app: "quotation", apiVersion: 1, channel: channel ?? null, count });
  }),
);

integrationRouter.get(
  "/quotes",
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const { items, total } = await listQuotes({
      search: parsed.data.search || undefined,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    res.json({
      items: items.map(toPublicQuote),
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
  }),
);

integrationRouter.get(
  "/quotes/:id",
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const quote = Number.isInteger(id) && id > 0 ? await getQuoteById(id) : undefined;
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    res.json(toPublicQuote(quote));
  }),
);
