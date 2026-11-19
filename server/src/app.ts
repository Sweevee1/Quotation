import path from "node:path";
import { existsSync } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { sessionMiddleware } from "./auth/session.js";
import { authRouter } from "./routes/auth.js";
import { quotesRouter } from "./routes/quotes.js";
import { settingsRouter } from "./routes/settings.js";
import { botRouter } from "./routes/bot.js";
import { eventsRouter } from "./routes/events.js";
import { twitchOAuthRouter } from "./routes/twitchOAuth.js";
import { backupsRouter } from "./routes/backups.js";
import { integrationRouter } from "./routes/integration.js";
import { publicQuotesRouter } from "./routes/publicQuotes.js";
import { requireCustomHeader, securityHeaders } from "./middleware/securityHeaders.js";

function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(
      { method: req.method, url: req.path === "/twitch/callback" ? req.path : req.originalUrl, status: res.statusCode, ms: Date.now() - start },
      "request",
    );
  });
  next();
}

/**
 * A second, minimal app that serves ONLY the public quotes page. Started on PUBLIC_PORT so
 * that one port can be forwarded/tunnelled without exposing the admin login or API.
 */
export function createPublicApp(): express.Express {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use(publicQuotesRouter);
  app.use((_req, res) => {
    res.status(404).set("Cache-Control", "no-store").type("text/plain").send("Not found");
  });
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    logger.error({ err, method: req.method, url: req.path }, "Unhandled request error");
    res.status(500).set("Cache-Control", "no-store").type("text/plain").send("Internal server error");
  });
  return app;
}

export function createApp(): express.Express {
  const app = express();

  // Needed so req.protocol reflects X-Forwarded-Proto when sitting behind a reverse proxy.
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");

  app.use(requestLogger);
  app.use(securityHeaders);
  app.use(express.json());
  // cookie-session's types are structurally close but not identical to express 4's RequestHandler generic.
  app.use(sessionMiddleware as unknown as express.RequestHandler);

  app.use("/api", requireCustomHeader);
  app.use("/api/auth", authRouter);
  app.use("/api/quotes", quotesRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/bot", botRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/backups", backupsRouter);
  app.use("/api/integration/v1", integrationRouter);
  app.use(publicQuotesRouter);
  app.use(twitchOAuthRouter);

  const webDist = path.join(import.meta.dirname, "../../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api|\/twitch|\/public).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  // Must be registered last: catches errors forwarded via next(err), including from asyncHandler.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    // body-parser errors (413 too large, 400 malformed JSON) carry a 4xx status; pass it through.
    const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ error: status === 413 ? "Payload too large" : "Bad request" });
      return;
    }
    logger.error({ err, method: req.method, url: req.path }, "Unhandled request error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
