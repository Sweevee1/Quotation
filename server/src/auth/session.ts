import cookieSession from "cookie-session";
import { env } from "../config/env.js";

// @types/cookie-session's SessionData has a string index signature, so
// req.session.authed already type-checks without further augmentation.

export const sessionMiddleware = cookieSession({
  name: "quotation.session",
  secret: env.SESSION_SECRET,
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
});
