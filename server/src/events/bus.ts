import { EventEmitter } from "node:events";
import type { BotEvent, BotEventType } from "@quotation/shared";

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export function publishEvent(type: BotEventType, message: string): void {
  const event: BotEvent = { type, message, timestamp: new Date().toISOString() };
  eventBus.emit("event", event);
}
