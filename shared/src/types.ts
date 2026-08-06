export const ROLES = [
  "everyone",
  "follower",
  "subscriber",
  "vip",
  "moderator",
  "broadcaster",
] as const;

export type Role = (typeof ROLES)[number];

/** Rank order used for permission comparisons — higher index = more privileged. */
export const ROLE_RANK: Record<Role, number> = {
  everyone: 0,
  follower: 1,
  subscriber: 2,
  vip: 3,
  moderator: 4,
  broadcaster: 5,
};

export const COMMAND_NAMES = [
  "addquote",
  "quote",
  "editquote",
  "removequote",
] as const;

export type CommandName = (typeof COMMAND_NAMES)[number];

export interface Quote {
  id: number;
  text: string;
  author: string;
  game: string | null;
  createdAt: string;
  addedBy: string;
  editedAt: string | null;
  editedBy: string | null;
}

export interface QuoteCreateInput {
  text: string;
  author?: string;
  game?: string | null;
  createdAt?: string;
  addedBy: string;
}

export interface QuoteUpdateInput {
  text?: string;
  author?: string;
  game?: string | null;
  createdAt?: string;
  editedBy: string;
}

export interface CommandConfig {
  commandName: CommandName;
  enabled: boolean;
  permissionLevel: Role;
  aliases: string[];
  cooldownGlobalSec: number;
  cooldownUserSec: number;
  modsBypassCooldown: boolean;
  responseTemplate: string;
  errorTemplate: string;
}

export interface TwitchSettings {
  channel: string;
  clientId: string;
  hasClientSecret: boolean;
  botLogin: string | null;
  connected: boolean;
}

export type BotConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface BotStatus {
  status: BotConnectionStatus;
  channel: string | null;
  botLogin: string | null;
  error: string | null;
  quoteCount: number;
}

export interface TwitchUserProfile {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
}

export interface BotProfiles {
  streamer: TwitchUserProfile | null;
  bot: TwitchUserProfile | null;
}

export const BACKUP_TRIGGERS = ["manual", "stream_start", "pre_restore", "import"] as const;
export type BackupTrigger = (typeof BACKUP_TRIGGERS)[number];

export interface QuoteBackupSummary {
  id: number;
  createdAt: string;
  trigger: BackupTrigger;
  quoteCount: number;
}

export interface RestoreBackupResult {
  restoredCount: number;
  /** null when the caller already took a safety snapshot moments earlier (e.g. right after an import). */
  safetyBackupId: number | null;
}

export type BotEventType =
  | "status"
  | "command"
  | "permission_denied"
  | "cooldown_skipped"
  | "error";

export interface BotEvent {
  type: BotEventType;
  message: string;
  timestamp: string;
}
