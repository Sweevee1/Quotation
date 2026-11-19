import { Router } from "express";
import { loginSchema, passwordChangeSchema, setupSchema } from "@quotation/shared";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { bumpSessionEpoch, isSessionValid, requireAuth, sessionToken } from "../middleware/requireAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getSetting, setSetting } from "../services/settingsService.js";

export const authRouter = Router();

// Shared brute-force budget for both password-checking endpoints: 10 attempts / 15 min / IP.
const authLimiter = rateLimit("auth", 10, 15 * 60_000);

authRouter.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    const hash = await getSetting("webui_password_hash");
    if (!hash || !(await verifyPassword(parsed.data.password, hash))) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }

    req.session = { authed: true, pw: await sessionToken(hash) };
    res.json({ authed: true });
  }),
);

// First run: no password exists yet, so the first visitor creates it (same as SweevElements).
// Refuses once a password is set, so it can't be used to overwrite one.
authRouter.post(
  "/setup",
  authLimiter,
  asyncHandler(async (req, res) => {
    if (await getSetting("webui_password_hash")) {
      res.status(409).json({ error: "A password is already set" });
      return;
    }
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const hash = await hashPassword(parsed.data.password);
    await setSetting("webui_password_hash", hash);
    req.session = { authed: true, pw: await sessionToken(hash) };
    res.json({ authed: true });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    // Revoke server-side too (invalidates every issued cookie). Only a valid session may do this,
    // so an anonymous request can't log the admin out.
    if (await isSessionValid(req)) await bumpSessionEpoch();
    req.session = null;
    res.json({ authed: false });
  }),
);

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json({ authed: await isSessionValid(req), needsSetup: !(await getSetting("webui_password_hash")) });
  }),
);

authRouter.post(
  "/change-password",
  authLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = passwordChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    const hash = await getSetting("webui_password_hash");
    if (!hash || !(await verifyPassword(parsed.data.currentPassword, hash))) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    await setSetting("webui_password_hash", newHash);
    // Re-issue this session for the new password; every other existing cookie is now invalid.
    await bumpSessionEpoch();
    req.session = { authed: true, pw: await sessionToken(newHash) };
    res.json({ ok: true });
  }),
);
