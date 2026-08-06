import type { CommandConfig } from "@quotation/shared";
import type { ChatTags } from "../permissions.js";

export interface CommandContext {
  /** Raw text following the command word/alias, already trimmed of the command itself. */
  args: string;
  tags: ChatTags;
  channelLogin: string;
  config: CommandConfig;
}
