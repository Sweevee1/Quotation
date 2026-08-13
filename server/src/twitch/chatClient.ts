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
/**
 * True only while a connect attempt is genuinely in flight. This is what guards against
 * duplicate logins — deliberately *not* `status === "connecting"`, which also covers the idle
 * gap between a drop and its scheduled retry. Conflating the two is what previously broke
 * auto-reconnect entirely: the retry fired while status was still "connecting" and connectBot()
 * bailed at its own guard, so after the first unexpected drop the bot never came back.
 */
let connectInFlight = false;
let reconnectTimer: NodeJS.Timeout | null = null;
/** Consecutive failed attempts, for backoff. Reset once a connection actually establishes. */
let reconnectAttempts = 0;

const RECONNECT_DELAY_MS = 5000;
const RECONNECT_MAX_DELAY_MS = 60000;
const CONNECT_TIMEOUT_MS = 20000;

const CONNECT_TIMEOUT_ERROR = "Connection attempt to Twitch IRC timed out";

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * Queues the single pending reconnect attempt. Backs off exponentially (capped) so a Twitch-side
 * outage isn't hammered every 5s indefinitely — every attempt re-checks/refreshes the bot token,
 * which means hitting Twitch's token endpoint too.
 */
function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = Math.min(RECONNECT_DELAY_MS * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY_MS);
  reconnectAttempts += 1;
  logger.info({ delay, attempt: reconnectAttempts }, "Scheduling Twitch chat reconnect");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (desiredConnected && !client && !connectInFlight) {
      connectBot().catch((err) => logger.error({ err }, "Reconnect failed"));
    }
  }, delay);
}

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
  if (status === "connected" || connectInFlight) {
    desiredConnected = true;
    return;
  }

  desiredConnected = true;
  // Set synchronously, before the first await, so two near-simultaneous triggers can't both get
  // past the guard and open competing IRC connections.
  connectInFlight = true;
  clearReconnectTimer();

  try {
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

    const accessToken = await getValidBotAccessToken();

    const thisClient = new TmiClient({
      identity: { username: botLogin, password: `oauth:${accessToken}` },
      channels: [channelLogin],
      connection: { reconnect: false },
    });
    client = thisClient;

    thisClient.on("connected", () => {
      // Ignore events from a client we've since superseded/torn down.
      if (client !== thisClient) return;
      reconnectAttempts = 0;
      setStatus("connected");
    });

    thisClient.on("disconnected", (reason: string) => {
      if (client !== thisClient) return;
      client = null;
      if (desiredConnected) {
        // tmi.js hands back an empty reason for a plain socket drop; keep something readable
        // in the status so the Dashboard shows why it's reconnecting.
        setStatus("connecting", reason?.trim() || "Connection to Twitch IRC dropped");
        scheduleReconnect();
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

    await withTimeout(thisClient.connect(), CONNECT_TIMEOUT_MS, CONNECT_TIMEOUT_ERROR);
  } catch (err) {
    // tmi.js's connect() promise can hang indefinitely on a stalled IRC handshake (e.g. a
    // network blip) without ever resolving or rejecting — withTimeout is what turns that into
    // a catchable error here. Treat it like an unexpected drop (retry) rather than a config
    // error (give up), since the underlying cause is transient, not a bad token/channel.
    const timedOut = err instanceof Error && err.message === CONNECT_TIMEOUT_ERROR;

    if (client) {
      await client.disconnect().catch(() => undefined);
      client = null;
    }

    if (timedOut && desiredConnected) {
      logger.warn({ err }, "Twitch IRC connect attempt timed out; retrying");
      setStatus("connecting", CONNECT_TIMEOUT_ERROR);
      scheduleReconnect();
    } else {
      logger.error({ err }, "Failed to connect Twitch chat bot");
      setStatus("error", err instanceof Error ? err.message : "Unknown connection error");
      desiredConnected = false;
      clearReconnectTimer();
    }
  } finally {
    connectInFlight = false;
  }
}

export async function disconnectBot(): Promise<void> {
  desiredConnected = false;
  clearReconnectTimer();
  reconnectAttempts = 0;
  if (client) {
    await client.disconnect().catch(() => undefined);
    client = null;
  }
  setStatus("disconnected");
}
