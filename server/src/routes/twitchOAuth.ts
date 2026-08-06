import { Router, type Request } from "express";
import { env } from "../config/env.js";
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

export const twitchOAuthRouter = Router();

function getRedirectUri(req: Request): string {
  const base = env.PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
  return `${base}/twitch/callback`;
}

function popupPage(message: string, ok: boolean): string {
  return `<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;">
<p>${ok ? "Authorised" : "Authorisation failed"} — ${message}</p>
<script>
  if (window.opener) { try { window.opener.postMessage("twitch-oauth-${ok ? "success" : "error"}", "*"); } catch (e) {} }
  setTimeout(() => window.close(), ${ok ? 1200 : 4000});
</script>
</body></html>`;
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
    res.status(400).send(popupPage(error_description || error, false));
    return;
  }

  if (!code || !state || !consumeOAuthState(state)) {
    res.status(400).send(popupPage("invalid or expired authorization state", false));
    return;
  }

  try {
    const redirectUri = getRedirectUri(req);
    const user = await completeAuthorizationCodeFlow(code, redirectUri);
    publishEvent("status", `Twitch bot account authorized as ${user.display_name}`);
    res.send(popupPage(`connected as ${user.display_name} — closing…`, true));

    // Bot should always be running once authorized+configured — no manual start needed.
    if (await getSetting("twitch_channel")) {
      connectBot().catch((err) => logger.error({ err }, "Auto-connect after authorization failed"));
    }
  } catch (err) {
    logger.error({ err }, "Twitch OAuth callback failed");
    res.status(500).send(popupPage("check server logs for details", false));
  }
});
