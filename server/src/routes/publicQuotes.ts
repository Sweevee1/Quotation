import { randomBytes } from "node:crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { getQuoteById, listQuotes } from "../services/quotesService.js";
import { isPublicPageEnabled, toPublicQuote } from "../services/integrationService.js";
import {
  PUBLIC_QUOTES_BASE,
  cspHeader,
  renderNotFound,
  renderQuoteList,
  renderSingleQuote,
} from "../services/publicQuotesPage.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Standalone, read-only, unauthenticated quotes page for installs that run Quotation
 * without SweevElements. Off unless the owner enables it; disabled and unknown URLs
 * return the same 404 body. Exposes only the restricted PublicQuote fields.
 */
export const publicQuotesRouter = Router();
publicQuotesRouter.use(PUBLIC_QUOTES_BASE, rateLimit("public", 90));

const PAGE_SIZE = 25;
const query = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  n: z.coerce.number().int().min(1).max(2_000_000_000).optional(),
});

function send(res: Response, status: number, html: (nonce: string) => string): void {
  const nonce = randomBytes(16).toString("base64");
  res
    .status(status)
    .set({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": cspHeader(nonce),
      // no-store (was public, max-age=30): a shared cache would reuse one CSP nonce for every visitor and keep
      // serving the page for up to 30 s after the owner switches it off. The page is rate limited and cheap.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
      "Cross-Origin-Opener-Policy": "same-origin",
    })
    .send(html(nonce));
}

const notFound = (res: Response) => send(res, 404, renderNotFound);

publicQuotesRouter.get(
  PUBLIC_QUOTES_BASE,
  asyncHandler(async (req, res) => {
    if (!(await isPublicPageEnabled())) return notFound(res);
    const parsed = query.safeParse(req.query);
    if (!parsed.success) return notFound(res);
    const { q, page, n } = parsed.data;
    if (n !== undefined) {
      res.redirect(302, `${PUBLIC_QUOTES_BASE}/${n}`);
      return;
    }
    const { items, total } = await listQuotes({ search: q || undefined, page, pageSize: PAGE_SIZE });
    send(res, 200, (nonce) =>
      renderQuoteList(nonce, {
        items: items.map(toPublicQuote),
        total,
        page,
        pageSize: PAGE_SIZE,
        search: q ?? "",
      }),
    );
  }),
);

publicQuotesRouter.get(
  `${PUBLIC_QUOTES_BASE}/:id`,
  asyncHandler(async (req, res) => {
    if (!(await isPublicPageEnabled())) return notFound(res);
    const id = /^\d{1,10}$/.test(req.params.id) ? Number.parseInt(req.params.id, 10) : 0;
    const quote = id > 0 ? await getQuoteById(id) : undefined;
    if (!quote) return notFound(res);
    send(res, 200, (nonce) => renderSingleQuote(nonce, toPublicQuote(quote)));
  }),
);
