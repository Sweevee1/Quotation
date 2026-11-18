import type { NextFunction, Request, Response } from "express";
import { verifyApiKey } from "../services/integrationService.js";

/** Accepts `Authorization: Bearer <key>` or `X-Api-Key: <key>`. */
export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.get("authorization");
    const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
    const presented = bearer ?? req.get("x-api-key") ?? "";
    if (await verifyApiKey(presented)) {
      next();
      return;
    }
    res.status(401).json({ error: "Invalid or missing API key" });
  } catch (err) {
    next(err);
  }
}
