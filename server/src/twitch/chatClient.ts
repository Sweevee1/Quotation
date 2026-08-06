import { Client as TmiClient } from "tmi.js";
import type { BotConnectionStatus, BotStatus } from "@quotation/shared";
import { logger } from "../logger.js";
import { getSetting } from "../services/settingsService.js";
import { countQuotes } from "../services/quotesService.js";
import { publishEvent } from "../events/bus.js";
import { getValidBotAccessToken, isBotAuthorized } from "./oauth.js";
import { handleChatMessage } from "./commandRouter.js";
import type { ChatTags } from "./permissions.js";

let client: TmiClient | null = null;
let status: BotConnectionStatus = "disconnected";
let lastError: string | null = null;
/** True once the user has asked to connect; drives auto-reconnect on unexpected drops. */
let desiredConnected = false;

const RECONNECT_DELAY_MS = 5000;

export async function getBotStatus(): Promise<BotStatus> {
  const [channel, botLogin, quoteCount] = await Promise.all([
    getSetting("twitch_channel"),
    getSetting("twitch_bot_login"),
    countQuotes(),
  ]);
  return {
    status,
    channel: channel ?? null,
    botLogin: botLogin ?? null,
    error: lastError,
    quoteCount,
  };
}

function setStatus(next: BotConnectionStatus, error: string | null = null): void {
  status = next;
  lastError = error;
  publishEvent("status", error ? `Bot ${next}: ${error}` : `Bot ${next}`);
}

export async function connectBot(): Promise<void> {
  // Several things can now trigger a connect attempt (boot, OAuth callback, settings save).
  // If we're already connected or mid-connect, calling through again would tear down a
  // perfectly good client and reconnect for no reason — which Twitch IRC treats as a
  // duplicate login and starts kicking, producing an endless connect/disconnect loop.
  if (status === "connected" || status === "connecting") {
    desiredConnected = true;
    return;
  }

  desiredConnected = true;

  const channelLogin = await getSetting("twitch_channel");
  const botLogin = await getSetting("twitch_bot_login");
  if (!channelLogin || !botLogin || !(await isBotAuthorized())) {
    setStatus("error", "Twitch channel/bot account is not fully configured yet");
    desiredConnected = false;
    return;
  }

  if (client) {
    await client.disconnect().catch(() => undefined);
    client = null;
  }

  setStatus("connecting");

  try {
    const accessToken = await getValidBotAccessToken();

    const thisClient = new TmiClient({
      identity: { username: botLogin, password: `oauth:${accessToken}` },
      channels: [channelLogin],
      connection: { reconnect: false },
    });
    client = thisClient;

    thisClient.on("connected", () => {
      // Ignore events from a client we've since superseded/torn down.
      if (client === thisClient) setStatus("connected");
    });

    thisClient.on("disconnected", (reason: string) => {
      if (client !== thisClient) return;
      client = null;
      if (desiredConnected) {
        setStatus("connecting", reason);
        setTimeout(() => {
          if (desiredConnected && !client) {
            connectBot().catch((err) => logger.error({ err }, "Reconnect failed"));
          }
        }, RECONNECT_DELAY_MS);
      } else {
        setStatus("disconnected");
      }
    });

    thisClient.on("message", (channel: string, tags: ChatTags, message: string, self: boolean) => {
      if (self) return;
      handleChatMessage(message, tags, async (reply) => {
        await thisClient.say(channel, reply);
      }).catch((err) => logger.error({ err }, "Failed to handle chat message"));
    });

    await thisClient.connect();
  } catch (err) {
    logger.error({ err }, "Failed to connect Twitch chat bot");
    setStatus("error", err instanceof Error ? err.message : "Unknown connection error");
    desiredConnected = false;
  }
}

export async function disconnectBot(): Promise<void> {
  desiredConnected = false;
  if (client) {
    await client.disconnect().catch(() => undefined);
    client = null;
  }
  setStatus("disconnected");
}
