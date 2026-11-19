import cookieSession from "cookie-session";
import { env } from "../config/env.js";

// @types/cookie-session's SessionData has a string index signature, so
// req.session.authed already type-checks without further augmentation.

// Deliberately omitting `secure`: the underlying `cookies` package then auto-detects it per
// request from req.protocol (which respects X-Forwarded-Proto, since app.ts sets "trust proxy").
// Hardcoding `secure: true` here previously broke plain-HTTP deployments (the common case for
// self-hosted/Unraid installs with no reverse-proxy TLS termination) — `cookies.set()` throws
// "Cannot send secure cookie over unencrypted connection" when secure:true but the request isn't
// HTTPS, and cookie-session silently swallows that throw, so the session cookie was just never
// sent and every request looked unauthenticated.
export const sessionMiddleware = cookieSession({
  name: "quotation.session",
  secret: env.SESSION_SECRET,
  httpOnly: true,
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
