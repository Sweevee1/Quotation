import type {
  BotProfiles,
  BotStatus,
  CommandConfig,
  CommandName,
  Quote,
  QuoteBackupSummary,
  RestoreBackupResult,
  TwitchSettings,
} from "@quotation/shared";

/** What the browser actually sends to create a quote — the server fills in `addedBy` itself. */
interface QuoteCreateInput {
  text: string;
  author?: string;
  game?: string | null;
  createdAt?: string;
}

interface QuoteUpdateInput {
  text?: string;
  author?: string;
  game?: string | null;
  createdAt?: string;
}

export interface QuoteImportItem {
  id?: number;
  text: string;
  author: string;
  game?: string | null;
  createdAt?: string;
  addedBy?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  login: (password: string) =>
    request<{ authed: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ authed: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ authed: boolean }>("/api/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  listQuotes: (params: { search?: string; page?: number; pageSize?: number }) =>
    request<{ items: Quote[]; total: number }>(`/api/quotes${qs(params)}`),
  createQuote: (input: QuoteCreateInput) =>
    request<Quote>("/api/quotes", { method: "POST", body: JSON.stringify(input) }),
  updateQuote: (id: number, input: QuoteUpdateInput) =>
    request<Quote>(`/api/quotes/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteQuote: (id: number) => request<void>(`/api/quotes/${id}`, { method: "DELETE" }),
  exportQuotes: () => request<{ quotes: Quote[] }>("/api/quotes/export"),
  importQuotes: (quotes: QuoteImportItem[]) =>
    request<{ imported: number }>("/api/quotes/import", {
      method: "POST",
      body: JSON.stringify({ quotes }),
    }),

  getTwitchSettings: () => request<TwitchSettings>("/api/settings/twitch"),
  updateTwitchSettings: (patch: { channel?: string; clientId?: string; clientSecret?: string }) =>
    request<{ ok: boolean }>("/api/settings/twitch", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  disconnectTwitchAuth: () =>
    request<{ ok: boolean }>("/api/settings/twitch/auth", { method: "DELETE" }),
  getTwitchAuthStatus: () => request<{ authorized: boolean }>("/api/settings/twitch/auth-status"),

  getIntegration: () =>
    request<{ hasApiKey: boolean; publicPageEnabled: boolean; publicPath: string; publicPort: number | null }>(
      "/api/settings/integration",
    ),
  setPublicPageEnabled: (publicPageEnabled: boolean) =>
    request<{ ok: boolean }>("/api/settings/integration", {
      method: "PUT",
      body: JSON.stringify({ publicPageEnabled }),
    }),
  generateApiKey: () => request<{ apiKey: string }>("/api/settings/integration/key", { method: "POST" }),
  revokeApiKey: () => request<{ ok: boolean }>("/api/settings/integration/key", { method: "DELETE" }),

  getCommandConfigs: () => request<CommandConfig[]>("/api/settings/commands"),
  updateCommandConfig: (name: CommandName, patch: Partial<CommandConfig>) =>
    request<CommandConfig>(`/api/settings/commands/${name}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  getBotStatus: () => request<BotStatus>("/api/bot/status"),
  getBotProfiles: () => request<BotProfiles>("/api/bot/profiles"),

  startTwitchOAuth: () => request<{ authUrl: string }>("/twitch/auth", { method: "POST" }),

  listBackups: () => request<QuoteBackupSummary[]>("/api/backups"),
  createBackup: () => request<QuoteBackupSummary>("/api/backups", { method: "POST" }),
  importBackup: (quotes: QuoteImportItem[]) =>
    request<QuoteBackupSummary>("/api/backups/import", {
      method: "POST",
      body: JSON.stringify({ quotes }),
    }),
  exportBackup: (id: number) => request<{ quotes: Quote[] }>(`/api/backups/${id}/export`),
  restoreBackup: (id: number, skipSafetyBackup = false) =>
    request<RestoreBackupResult>(`/api/backups/${id}/restore`, {
      method: "POST",
      body: JSON.stringify({ skipSafetyBackup }),
    }),
};
