import { getSetting } from "../services/settingsService.js";
import { createBackup } from "../services/backupService.js";
import { isChannelLive } from "./helixClient.js";
import { publishEvent } from "../events/bus.js";
import { logger } from "../logger.js";

const POLL_INTERVAL_MS = 2 * 60 * 1000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let wasLive = false;
/** True once we've taken one real reading — avoids treating "booted mid-stream" as a go-live transition. */
let initialized = false;

async function checkLiveStatus(): Promise<void> {
  try {
    const channel = await getSetting("twitch_channel");
    if (!channel) return;

    const isLive = await isChannelLive(channel);

    if (!initialized) {
      wasLive = isLive;
      initialized = true;
      return;
    }

    if (isLive && !wasLive) {
      logger.info("Stream went live — creating automatic quote backup");
      const backup = await createBackup("stream_start");
      publishEvent("status", `Stream started — automatic backup created (${backup.quoteCount} quotes)`);
    }
    wasLive = isLive;
  } catch (err) {
    logger.warn({ err }, "Stream status check failed");
  }
}

export function startStreamMonitor(): void {
  if (pollTimer) return;
  checkLiveStatus().catch((err) => logger.warn({ err }, "Initial stream status check failed"));
  pollTimer = setInterval(() => {
    checkLiveStatus().catch((err) => logger.warn({ err }, "Stream status check failed"));
  }, POLL_INTERVAL_MS);
}
