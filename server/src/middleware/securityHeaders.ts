import type { NextFunction, Request, Response } from "express";

/**
 * Baseline headers for the admin app (SPA + API). Routes that render their own pages (public quotes,
 * OAuth popup) set a stricter CSP afterwards, which overrides this one. script-src 'self' is the
 * important directive; inline style attributes are allowed because React components use them.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: https://static-cdn.jtvnw.net https://*.jtvnw.net",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set({
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  next();
}

/**
 * CSRF defence for cookie auth: state-changing /api requests must carry a custom header, which a
 * cross-site form or simple request cannot add (and a cross-origin fetch with it needs a CORS
 * preflight this server never grants). The SPA's request() wrapper sends it.
 */
export function requireCustomHeader(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  if (req.get("x-requested-with") !== "quotation") {
    res.status(403).json({ error: "Missing X-Requested-With header" });
    return;
  }
  next();
}
