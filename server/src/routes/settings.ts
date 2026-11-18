import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  hasApiKey,
  isPublicPageEnabled,
  regenerateApiKey,
  revokeApiKey,
  setPublicPageEnabled,
} from "../services/integrationService.js";
import {
  commandConfigUpdateSchema,
  commandNameSchema,
  twitchSettingsUpdateSchema,
} from "@quotation/shared";
import type { TwitchSettings } from "@quotation/shared";
import {
  getAllCommandConfigs,
  getSetting,
  setSetting,
  updateCommandConfig,
} from "../services/settingsService.js";
import { disconnectBotAuthorization, isBotAuthorized } from "../twitch/oauth.js";
import { connectBot, disconnectBot, getBotStatus } from "../twitch/chatClient.js";
import { logger } from "../logger.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  "/twitch",
  asyncHandler(async (_req, res) => {
    const [channel, clientId, clientSecret, botLogin, status] = await Promise.all([
      getSetting("twitch_channel"),
      getSetting("twitch_client_id"),
      getSetting("twitch_client_secret"),
      getSetting("twitch_bot_login"),
      getBotStatus(),
    ]);
    const payload: TwitchSettings = {
      channel: channel ?? "",
      clientId: clientId ?? "",
      hasClientSecret: Boolean(clientSecret),
      botLogin: botLogin ?? null,
      connected: status.status === "connected",
    };
    res.json(payload);
  }),
);

settingsRouter.put(
  "/twitch",
  asyncHandler(async (req, res) => {
    const parsed = twitchSettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { channel, clientId, clientSecret } = parsed.data;
    if (channel !== undefined) await setSetting("twitch_channel", channel.toLowerCase());
    if (clientId !== undefined) await setSetting("twitch_client_id", clientId);
    if (clientSecret !== undefined) await setSetting("twitch_client_secret", clientSecret);
    res.json({ ok: true });

    // Bot should always be running once authorized+configured — no manual start needed.
    const status = await getBotStatus();
    if (channel && status.status !== "connected" && status.status !== "connecting" && (await isBotAuthorized())) {
      connectBot().catch((err) => logger.error({ err }, "Auto-connect after settings save failed"));
    }
  }),
);

settingsRouter.delete(
  "/twitch/auth",
  asyncHandler(async (_req, res) => {
    await disconnectBot();
    await disconnectBotAuthorization();
    res.json({ ok: true });
  }),
);

settingsRouter.get(
  "/twitch/auth-status",
  asyncHandler(async (_req, res) => {
    res.json({ authorized: await isBotAuthorized() });
  }),
);

settingsRouter.get(
  "/commands",
  asyncHandler(async (_req, res) => {
    res.json(await getAllCommandConfigs());
  }),
);

settingsRouter.put(
  "/commands/:commandName",
  asyncHandler(async (req, res) => {
    const nameParsed = commandNameSchema.safeParse(req.params.commandName);
    if (!nameParsed.success) {
      res.status(400).json({ error: "Unknown command" });
      return;
    }
    const bodyParsed = commandConfigUpdateSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: bodyParsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const updated = await updateCommandConfig(nameParsed.data, bodyParsed.data);
    res.json(updated);
  }),
);

// --- Integration: API key for linked apps + the standalone public quotes page ---

settingsRouter.get(
  "/integration",
  asyncHandler(async (_req, res) => {
    res.json({
      hasApiKey: await hasApiKey(),
      publicPageEnabled: await isPublicPageEnabled(),
      publicPath: "/public/quotes",
      publicPort: env.PUBLIC_PORT ?? null,
    });
  }),
);

settingsRouter.put(
  "/integration",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ publicPageEnabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    await setPublicPageEnabled(parsed.data.publicPageEnabled);
    res.json({ ok: true });
  }),
);

/** Generates (or replaces) the API key. The plaintext is returned exactly once. */
settingsRouter.post(
  "/integration/key",
  asyncHandler(async (_req, res) => {
    res.json({ apiKey: await regenerateApiKey() });
  }),
);

settingsRouter.delete(
  "/integration/key",
  asyncHandler(async (_req, res) => {
    await revokeApiKey();
    res.json({ ok: true });
  }),
);
