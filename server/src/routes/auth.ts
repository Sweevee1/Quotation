import { Router } from "express";
import { loginSchema, passwordChangeSchema } from "@quotation/shared";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { requireAuth } from "../middleware/requireAuth.js";
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

    req.session = { authed: true };
    res.json({ authed: true });
  }),
);

authRouter.post("/logout", (req, res) => {
  req.session = null;
  res.json({ authed: false });
});

authRouter.get("/me", (req, res) => {
  res.json({ authed: Boolean(req.session?.authed) });
});

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

    await setSetting("webui_password_hash", await hashPassword(parsed.data.newPassword));
    res.json({ ok: true });
  }),
);
