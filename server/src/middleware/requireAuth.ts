import type { NextFunction, Request, Response } from "express";
import { passwordFingerprint } from "../auth/password.js";
import { getSetting } from "../services/settingsService.js";

/** True if the session is logged in AND was issued for the current password. */
export async function isSessionValid(req: Request): Promise<boolean> {
  if (!req.session?.authed) return false;
  const hash = await getSetting("webui_password_hash");
  return Boolean(hash) && req.session.pw === passwordFingerprint(hash!);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  isSessionValid(req)
    .then((ok) => (ok ? next() : res.status(401).json({ error: "Not authenticated" })))
    .catch(next);
}
