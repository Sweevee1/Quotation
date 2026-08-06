import { getSetting } from "../services/settingsService.js";
import { getValidBotAccessToken } from "./oauth.js";
import { logger } from "../logger.js";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const HELIX_BASE = "https://api.twitch.tv/helix";

let appAccessToken: { token: string; expiresAt: number } | null = null;

async function requireCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const clientId = await getSetting("twitch_client_id");
  const clientSecret = await getSetting("twitch_client_secret");
  if (!clientId || !clientSecret) {
    throw new Error("Twitch client ID/secret are not configured.");
  }
  return { clientId, clientSecret };
}

/** App access tokens (Client Credentials grant) need no user interaction and are cached in memory. */
async function getAppAccessToken(): Promise<string> {
  if (appAccessToken && appAccessToken.expiresAt - 60_000 > Date.now()) {
    return appAccessToken.token;
  }

  const { clientId, clientSecret } = await requireCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to obtain Twitch app access token (${res.status})`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  appAccessToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return appAccessToken.token;
}

async function helixGet<T>(path: string, accessToken: string): Promise<T> {
  const { clientId } = await requireCredentials();
  const res = await fetch(`${HELIX_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": clientId },
  });
  if (!res.ok) {
    throw new Error(`Helix request failed (${res.status}): ${path}`);
  }
  return (await res.json()) as T;
}

let broadcasterIdCache: { login: string; id: string } | null = null;

export async function getBroadcasterId(channelLogin: string): Promise<string> {
  if (broadcasterIdCache?.login === channelLogin.toLowerCase()) {
    return broadcasterIdCache.id;
  }
  const token = await getAppAccessToken();
  const data = await helixGet<{ data: { id: string; login: string }[] }>(
    `/users?login=${encodeURIComponent(channelLogin.toLowerCase())}`,
    token,
  );
  const user = data.data[0];
  if (!user) throw new Error(`Twitch channel "${channelLogin}" not found`);
  broadcasterIdCache = { login: channelLogin.toLowerCase(), id: user.id };
  return user.id;
}

export async function isChannelLive(channelLogin: string): Promise<boolean> {
  const broadcasterId = await getBroadcasterId(channelLogin);
  const token = await getAppAccessToken();
  const data = await helixGet<{ data: unknown[] }>(`/streams?user_id=${broadcasterId}`, token);
  return data.data.length > 0;
}

export async function getCurrentGame(channelLogin: string): Promise<string | null> {
  try {
    const broadcasterId = await getBroadcasterId(channelLogin);
    const token = await getAppAccessToken();
    const data = await helixGet<{ data: { game_name: string }[] }>(
      `/channels?broadcaster_id=${broadcasterId}`,
      token,
    );
    return data.data[0]?.game_name || null;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch current game — quote will be saved without it");
    return null;
  }
}

export interface UserProfile {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
}

interface ProfileCacheEntry {
  profile: UserProfile;
  expiresAt: number;
}
const profileCache = new Map<string, ProfileCacheEntry>();
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getUserProfile(login: string): Promise<UserProfile | null> {
  const key = login.toLowerCase();
  const cached = profileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  try {
    const token = await getAppAccessToken();
    const data = await helixGet<{
      data: { id: string; login: string; display_name: string; profile_image_url: string }[];
    }>(`/users?login=${encodeURIComponent(key)}`, token);
    const user = data.data[0];
    if (!user) return null;
    const profile: UserProfile = {
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      profileImageUrl: user.profile_image_url,
    };
    profileCache.set(key, { profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
    return profile;
  } catch (err) {
    logger.warn({ err, login }, "Failed to fetch Twitch profile");
    return null;
  }
}

interface FollowerCacheEntry {
  isFollowing: boolean;
  expiresAt: number;
}
const followerCache = new Map<string, FollowerCacheEntry>();
const FOLLOWER_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Checks whether a user follows the channel, using the bot account's moderator token.
 * Requires the bot account to be a moderator on the channel (moderator:read:followers scope).
 */
export async function isFollowing(channelLogin: string, userId: string): Promise<boolean> {
  const cacheKey = `${channelLogin.toLowerCase()}:${userId}`;
  const cached = followerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isFollowing;
  }

  const broadcasterId = await getBroadcasterId(channelLogin);
  const token = await getValidBotAccessToken();
  const data = await helixGet<{ data: unknown[] }>(
    `/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`,
    token,
  );
  const result = data.data.length > 0;
  followerCache.set(cacheKey, { isFollowing: result, expiresAt: Date.now() + FOLLOWER_CACHE_TTL_MS });
  return result;
}
