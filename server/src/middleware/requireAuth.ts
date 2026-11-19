import type { NextFunction, Request, Response } from "express";
import { passwordFingerprint } from "../auth/password.js";
import { randomBytes } from "node:crypto";
import { getSetting, setSetting } from "../services/settingsService.js";

/**
 * Value stored in the session cookie: binds it to the current password hash AND a server-side epoch
 * that logout/password change bumps, so a copied cookie stops working once the admin logs out.
 */
export async function sessionToken(hash: string): Promise<string> {
  const epoch = (await getSetting("session_epoch")) ?? "0";
  return passwordFingerprint(`${hash}:${epoch}`);
}

export async function bumpSessionEpoch(): Promise<void> {
  await setSetting("session_epoch", randomBytes(8).toString("hex"));
}

/** True if the session is logged in AND was issued for the current password. */
export async function isSessionValid(req: Request): Promise<boolean> {
  if (!req.session?.authed) return false;
  const hash = await getSetting("webui_password_hash");
  return Boolean(hash) && req.session.pw === (await sessionToken(hash!));
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  isSessionValid(req)
    .then((ok) => (ok ? next() : res.status(401).json({ error: "Not authenticated" })))
    .catch(next);
}
