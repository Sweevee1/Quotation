import { Router } from "express";
import { quoteCreateSchema, quoteImportSchema, quoteListQuerySchema, quoteUpdateSchema } from "@quotation/shared";
import {
  createQuote,
  deleteQuote,
  exportAllQuotes,
  getQuoteById,
  importQuotes,
  listQuotes,
  updateQuote,
} from "../services/quotesService.js";
import { getSetting } from "../services/settingsService.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const quotesRouter = Router();
quotesRouter.use(requireAuth);

quotesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = quoteListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }
    const { search, page, pageSize } = parsed.data;
    const result = await listQuotes({ search, page, pageSize });
    res.json(result);
  }),
);

quotesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = quoteCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const defaultAuthor = (await getSetting("twitch_channel")) ?? "broadcaster";
    const quote = await createQuote({ ...parsed.data, addedBy: "webui" }, defaultAuthor);
    res.status(201).json(quote);
  }),
);

// Registered before "/:id" so "export"/"import" aren't parsed as an id.
quotesRouter.get(
  "/export",
  asyncHandler(async (_req, res) => {
    const items = await exportAllQuotes();
    res.setHeader("Content-Disposition", 'attachment; filename="quotes-export.json"');
    res.json({ quotes: items });
  }),
);

quotesRouter.post(
  "/import",
  asyncHandler(async (req, res) => {
    const parsed = quoteImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import payload" });
      return;
    }
    const result = await importQuotes(parsed.data.quotes);
    res.json(result);
  }),
);

quotesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid quote id" });
      return;
    }
    const quote = await getQuoteById(id);
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    res.json(quote);
  }),
);

quotesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid quote id" });
      return;
    }
    const parsed = quoteUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const quote = await updateQuote(id, { ...parsed.data, editedBy: "webui" });
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    res.json(quote);
  }),
);

quotesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid quote id" });
      return;
    }
    const removed = await deleteQuote(id);
    if (!removed) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    res.status(204).end();
  }),
);
