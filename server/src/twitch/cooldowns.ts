import type { CommandName } from "@quotation/shared";

interface CooldownState {
  lastGlobalRun: number;
  perUser: Map<string, number>;
}

const state = new Map<CommandName, CooldownState>();

function getState(commandName: CommandName): CooldownState {
  let s = state.get(commandName);
  if (!s) {
    s = { lastGlobalRun: 0, perUser: new Map() };
    state.set(commandName, s);
  }
  return s;
}

export type CooldownResult = { allowed: true } | { allowed: false; reason: "global" | "user" };

export function checkCooldown(
  commandName: CommandName,
  username: string,
  cooldownGlobalSec: number,
  cooldownUserSec: number,
): CooldownResult {
  const now = Date.now();
  const s = getState(commandName);

  if (cooldownGlobalSec > 0 && now - s.lastGlobalRun < cooldownGlobalSec * 1000) {
    return { allowed: false, reason: "global" };
  }
  const lastUserRun = s.perUser.get(username.toLowerCase()) ?? 0;
  if (cooldownUserSec > 0 && now - lastUserRun < cooldownUserSec * 1000) {
    return { allowed: false, reason: "user" };
  }
  return { allowed: true };
}

/** Records that the command actually ran, starting its cooldown window. */
export function recordRun(commandName: CommandName, username: string): void {
  const now = Date.now();
  const s = getState(commandName);
  s.lastGlobalRun = now;
  s.perUser.set(username.toLowerCase(), now);
}
