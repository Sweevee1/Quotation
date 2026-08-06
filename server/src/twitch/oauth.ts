import crypto from "node:crypto";
import { logger } from "../logger.js";
import { getSetting, setSetting, deleteSetting } from "../services/settingsService.js";

const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";

/** Scopes needed for tmi.js chat login plus the live Follower permission check. */
export const BOT_SCOPES = ["chat:read", "chat:edit", "moderator:read:followers"];

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

/** Ephemeral CSRF state store for the popup OAuth flow — single-user app, in-memory is fine. */
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

export function createOAuthState(): string {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  for (const [key, expiresAt] of pendingStates) {
    if (expiresAt < Date.now()) pendingStates.delete(key);
  }
  return state;
}

export function consumeOAuthState(state: string): boolean {
  const expiresAt = pendingStates.get(state);
  pendingStates.delete(state);
  return expiresAt !== undefined && expiresAt >= Date.now();
}

export async function buildAuthorizeUrl(redirectUri: string, state: string): Promise<string> {
  const clientId = await getSetting("twitch_client_id");
  if (!clientId) {
    throw new Error("Twitch client ID is not configured yet — save it in Settings first.");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: BOT_SCOPES.join(" "),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitch token request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

async function persistTokens(tokens: TokenResponse): Promise<void> {
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  await setSetting("twitch_bot_access_token", tokens.access_token);
  await setSetting("twitch_bot_refresh_token", tokens.refresh_token);
  await setSetting("twitch_bot_token_expires_at", String(expiresAt));
}

interface HelixUser {
  id: string;
  login: string;
  display_name: string;
}

async function fetchAuthorizedUser(accessToken: string, clientId: string): Promise<HelixUser> {
  const res = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch bot account info (${res.status})`);
  }
  const data = (await res.json()) as { data: HelixUser[] };
  const user = data.data[0];
  if (!user) throw new Error("Twitch returned no user for this token");
  return user;
}

/** Exchanges an authorization code for tokens and persists them, identifying the bot account. */
export async function completeAuthorizationCodeFlow(
  code: string,
  redirectUri: string,
): Promise<HelixUser> {
  const clientId = await getSetting("twitch_client_id");
  const clientSecret = await getSetting("twitch_client_secret");
  if (!clientId || !clientSecret) {
    throw new Error("Twitch client ID/secret are not configured.");
  }

  const tokens = await requestToken(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  );
  await persistTokens(tokens);

  const user = await fetchAuthorizedUser(tokens.access_token, clientId);
  await setSetting("twitch_bot_login", user.login);
  await setSetting("twitch_bot_user_id", user.id);
  logger.info({ botLogin: user.login }, "Twitch bot account authorized");
  return user;
}

async function refreshAccessToken(): Promise<string> {
  const clientId = await getSetting("twitch_client_id");
  const clientSecret = await getSetting("twitch_client_secret");
  const refreshToken = await getSetting("twitch_bot_refresh_token");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Twitch bot is not authorized yet — connect it from Settings.");
  }

  const tokens = await requestToken(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  );
  await persistTokens(tokens);
  logger.info("Twitch bot access token refreshed");
  return tokens.access_token;
}

/** Returns a currently-valid bot user access token, refreshing it first if it's near expiry. */
export async function getValidBotAccessToken(): Promise<string> {
  const accessToken = await getSetting("twitch_bot_access_token");
  const expiresAt = Number((await getSetting("twitch_bot_token_expires_at")) ?? 0);
  const SAFETY_MARGIN_MS = 60_000;

  if (accessToken && expiresAt - SAFETY_MARGIN_MS > Date.now()) {
    return accessToken;
  }
  return refreshAccessToken();
}

export async function isBotAuthorized(): Promise<boolean> {
  return Boolean(await getSetting("twitch_bot_refresh_token"));
}

export async function disconnectBotAuthorization(): Promise<void> {
  for (const key of [
    "twitch_bot_access_token",
    "twitch_bot_refresh_token",
    "twitch_bot_token_expires_at",
    "twitch_bot_login",
    "twitch_bot_user_id",
  ]) {
    await deleteSetting(key);
  }
}
