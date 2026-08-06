import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getBotStatus } from "../twitch/chatClient.js";
import { getUserProfile } from "../twitch/helixClient.js";
import { getSetting } from "../services/settingsService.js";

export const botRouter = Router();
botRouter.use(requireAuth);

botRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json(await getBotStatus());
  }),
);

botRouter.get(
  "/profiles",
  asyncHandler(async (_req, res) => {
    const [channel, botLogin] = await Promise.all([
      getSetting("twitch_channel"),
      getSetting("twitch_bot_login"),
    ]);
    const [streamer, bot] = await Promise.all([
      channel ? getUserProfile(channel) : Promise.resolve(null),
      botLogin ? getUserProfile(botLogin) : Promise.resolve(null),
    ]);
    res.json({ streamer, bot });
  }),
);
