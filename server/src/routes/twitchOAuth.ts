import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { logger } from "../logger.js";
import {
  buildAuthorizeUrl,
  completeAuthorizationCodeFlow,
  createOAuthState,
  consumeOAuthState,
} from "../twitch/oauth.js";
import { publishEvent } from "../events/bus.js";
import { connectBot } from "../twitch/chatClient.js";
import { getSetting } from "../services/settingsService.js";
import { esc } from "../services/publicQuotesPage.js";

export const twitchOAuthRouter = Router();

function getRedirectUri(req: Request): string {
  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}/twitch/callback`;
}

function sendPopup(res: Response, status: number, message: string, ok: boolean): void {
  const nonce = randomBytes(16).toString("base64");
  res
    .status(status)
    .set({
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    })
    .type("html")
    .send(`<!doctype html><html><head><style nonce="${nonce}">body{font-family:sans-serif;padding:2rem}</style></head><body>
<p>${ok ? "Authorised" : "Authorisation failed"} — ${esc(message)}</p>
<script nonce="${nonce}">
  if (window.opener) { try { window.opener.postMessage("twitch-oauth-${ok ? "success" : "error"}", window.location.origin); } catch (e) {} }
  setTimeout(() => window.close(), ${ok ? 1200 : 4000});
</script>
</body></html>`);
}

// Kicks off the flow: builds and returns the Twitch authorize URL for the popup to navigate to.
twitchOAuthRouter.post("/twitch/auth", requireAuth, async (req, res) => {
  try {
    const redirectUri = getRedirectUri(req);
    const state = createOAuthState();
    const authUrl = await buildAuthorizeUrl(redirectUri, state);
    res.json({ authUrl });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to start Twitch auth" });
  }
});

// Defensive shim: if the registered Twitch redirect URI ever points at /twitch/auth
// instead of /twitch/callback, forward the callback query params transparently.
twitchOAuthRouter.get("/twitch/auth", (req, res) => {
  const query = new URLSearchParams(req.query as Record<string, string>).toString();
  res.redirect(`/twitch/callback${query ? `?${query}` : ""}`);
});

twitchOAuthRouter.get("/twitch/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (error) {
    logger.warn({ error, error_description }, "Twitch OAuth denied/errored");
    sendPopup(res, 400, error_description || error, false);
    return;
  }

  if (!code || !state || !consumeOAuthState(state)) {
    sendPopup(res, 400, "invalid or expired authorization state", false);
    return;
  }

  try {
    const redirectUri = getRedirectUri(req);
    const user = await completeAuthorizationCodeFlow(code, redirectUri);
    publishEvent("status", `Twitch bot account authorized as ${user.display_name}`);
    sendPopup(res, 200, `connected as ${user.display_name} — closing…`, true);

    // Bot should always be running once authorized+configured — no manual start needed.
    if (await getSetting("twitch_channel")) {
      connectBot().catch((err) => logger.error({ err }, "Auto-connect after authorization failed"));
    }
  } catch (err) {
    logger.error({ err }, "Twitch OAuth callback failed");
    sendPopup(res, 500, "check server logs for details", false);
  }
});
