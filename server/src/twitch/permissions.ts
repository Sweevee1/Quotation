import { ROLE_RANK, type Role } from "@quotation/shared";
import { isFollowing } from "./helixClient.js";
import { logger } from "../logger.js";

/** Minimal shape we need from tmi.js chat tags — kept local to avoid coupling to community types. */
export interface ChatTags {
  username?: string;
  "user-id"?: string;
  mod?: boolean;
  subscriber?: boolean;
  badges?: Record<string, string | undefined> | null;
}

/** Synchronous role resolution from chat badges/tags — no network calls. */
export function resolveBadgeRole(tags: ChatTags, channelLogin: string): Role {
  const username = (tags.username ?? "").toLowerCase();
  if (username === channelLogin.toLowerCase() || tags.badges?.broadcaster === "1") {
    return "broadcaster";
  }
  if (tags.mod || tags.badges?.moderator === "1") return "moderator";
  if (tags.badges?.vip === "1") return "vip";
  if (tags.subscriber || tags.badges?.subscriber) return "subscriber";
  return "everyone";
}

/**
 * Full permission check. Badge-derived roles (subscriber/vip/moderator/broadcaster) are
 * resolved synchronously; the Follower tier requires a live (cached) Helix API call, so it's
 * only made when the command actually requires Follower and badges alone don't already pass.
 */
export async function hasPermission(
  tags: ChatTags,
  requiredRole: Role,
  channelLogin: string,
): Promise<boolean> {
  const badgeRole = resolveBadgeRole(tags, channelLogin);
  if (ROLE_RANK[badgeRole] >= ROLE_RANK[requiredRole]) return true;

  if (requiredRole === "follower" && badgeRole === "everyone") {
    const userId = tags["user-id"];
    if (!userId) return false;
    try {
      return await isFollowing(channelLogin, userId);
    } catch (err) {
      logger.warn({ err }, "Follower check failed — denying access");
      return false;
    }
  }

  return false;
}
