import type { NextFunction, Request, Response } from "express";

/**
 * Tiny in-memory per-IP sliding-window limiter for the unauthenticated surfaces (the
 * integration API and the public quotes page). The bucket map is capped so a flood of
 * distinct IPs cannot grow memory without bound.
 */
export function rateLimit(bucket: string, max: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${bucket}:${req.ip ?? "unknown"}`;
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    recent.push(now);
    hits.delete(key);
    hits.set(key, recent);
    if (hits.size > 5000) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }
    next();
  };
}
