import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { runMigrations } from "./db/client.js";
import { ensureBootstrap, getSetting } from "./services/settingsService.js";
import { createApp } from "./app.js";
import { connectBot } from "./twitch/chatClient.js";
import { isBotAuthorized, getValidBotAccessToken } from "./twitch/oauth.js";
import { startStreamMonitor } from "./twitch/streamMonitor.js";

await runMigrations();
await ensureBootstrap();

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Quotation server listening on port ${env.PORT}`);
});

// Auto-connect on boot if the bot was already authorized/configured in a previous session.
if ((await isBotAuthorized()) && (await getSetting("twitch_channel"))) {
  getValidBotAccessToken()
    .then(() => connectBot())
    .catch((err) => logger.warn({ err }, "Skipped auto-connect on boot"));
}

// Polls Helix for the channel going live so we can auto-backup quotes at stream start.
startStreamMonitor();
