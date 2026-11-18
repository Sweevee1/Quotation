import https from "node:https";
import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { runMigrations } from "./db/client.js";
import { ensureBootstrap, getSetting } from "./services/settingsService.js";
import { createApp, createPublicApp } from "./app.js";
import { connectBot } from "./twitch/chatClient.js";
import { isBotAuthorized, getValidBotAccessToken } from "./twitch/oauth.js";
import { startStreamMonitor } from "./twitch/streamMonitor.js";
import { ensureSelfSignedCert } from "./tls/selfSignedCert.js";

await runMigrations();
await ensureBootstrap();

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Quotation server listening on port ${env.PORT}`);
});

if (env.PUBLIC_PORT) {
  createPublicApp().listen(env.PUBLIC_PORT, () => {
    logger.info(`Quotation public quotes page listening on port ${env.PUBLIC_PORT}`);
  });
}

// Opt-in bundled HTTPS listener for deployments with no reverse-proxy TLS termination —
// exists solely so the Twitch OAuth redirect URI can be HTTPS, which Twitch requires for
// anything but literal "localhost". See TLS_PORT's doc comment in config/env.ts.
if (env.TLS_PORT) {
  const hostname = env.PUBLIC_URL ? new URL(env.PUBLIC_URL).hostname : undefined;
  const { key, cert } = await ensureSelfSignedCert(env.DATA_DIR, hostname);
  https.createServer({ key, cert }, app).listen(env.TLS_PORT, () => {
    logger.info(`Quotation self-signed HTTPS listening on port ${env.TLS_PORT} (for Twitch OAuth callback)`);
  });
}

// Auto-connect on boot if the bot was already authorized/configured in a previous session.
if ((await isBotAuthorized()) && (await getSetting("twitch_channel"))) {
  getValidBotAccessToken()
    .then(() => connectBot())
    .catch((err) => logger.warn({ err }, "Skipped auto-connect on boot"));
}

// Polls Helix for the channel going live so we can auto-backup quotes at stream start.
startStreamMonitor();
