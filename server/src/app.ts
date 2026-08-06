import path from "node:path";
import { existsSync } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import { logger } from "./logger.js";
import { sessionMiddleware } from "./auth/session.js";
import { authRouter } from "./routes/auth.js";
import { quotesRouter } from "./routes/quotes.js";
import { settingsRouter } from "./routes/settings.js";
import { botRouter } from "./routes/bot.js";
import { eventsRouter } from "./routes/events.js";
import { twitchOAuthRouter } from "./routes/twitchOAuth.js";
import { backupsRouter } from "./routes/backups.js";

function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(
      { method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - start },
      "request",
    );
  });
  next();
}

export function createApp(): express.Express {
  const app = express();

  // Needed so req.protocol reflects X-Forwarded-Proto when sitting behind a reverse proxy.
  app.set("trust proxy", 1);

  app.use(requestLogger);
  app.use(express.json());
  // cookie-session's types are structurally close but not identical to express 4's RequestHandler generic.
  app.use(sessionMiddleware as unknown as express.RequestHandler);

  app.use("/api/auth", authRouter);
  app.use("/api/quotes", quotesRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/bot", botRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/backups", backupsRouter);
  app.use(twitchOAuthRouter);

  const webDist = path.join(import.meta.dirname, "../../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api|\/twitch).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  // Must be registered last: catches errors forwarded via next(err), including from asyncHandler.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    logger.error({ err, method: req.method, url: req.originalUrl }, "Unhandled request error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
