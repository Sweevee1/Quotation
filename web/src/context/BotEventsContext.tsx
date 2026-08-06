import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { BotEvent } from "@quotation/shared";

const MAX_LOG_ENTRIES = 100;
/** Server sends a heartbeat every 15s; if we go this long without one, the connection is stale. */
const STALE_AFTER_MS = 40_000;
const STALE_CHECK_INTERVAL_MS = 10_000;

const BotEventsContext = createContext<BotEvent[] | null>(null);

/**
 * Owns the SSE connection to /api/events at the app root, so the live activity log survives
 * navigating between pages instead of resetting every time the Dashboard unmounts.
 *
 * Also self-heals: a dev-server restart (or any mid-stream network blip) can leave the browser's
 * EventSource silently "open" but no longer actually receiving anything — the underlying socket
 * dies without a clean close, so the browser's built-in reconnect never fires. We track the last
 * time *any* message (including heartbeats) arrived and force-reconnect if it goes stale.
 */
export function BotEventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<BotEvent[]>([]);
  const lastMessageAtRef = useRef(Date.now());

  useEffect(() => {
    let source: EventSource | null = null;
    let staleCheck: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      source = new EventSource("/api/events");
      lastMessageAtRef.current = Date.now();

      source.onmessage = (e) => {
        lastMessageAtRef.current = Date.now();
        try {
          const event = JSON.parse(e.data) as BotEvent;
          setEvents((prev) => [event, ...prev].slice(0, MAX_LOG_ENTRIES));
        } catch {
          // ignore malformed frames
        }
      };

      source.addEventListener("heartbeat", () => {
        lastMessageAtRef.current = Date.now();
      });
      // No onerror handling needed: native EventSource retry already handles clean
      // disconnects/reconnects on its own. The staleness check below exists specifically
      // for the case that never fires an error at all — a connection that looks "open" but
      // has silently died — which onerror can't see either.
    }

    connect();

    staleCheck = setInterval(() => {
      if (cancelled) return;
      if (Date.now() - lastMessageAtRef.current > STALE_AFTER_MS) {
        source?.close();
        connect();
      }
    }, STALE_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (staleCheck) clearInterval(staleCheck);
      source?.close();
    };
  }, []);

  return <BotEventsContext.Provider value={events}>{children}</BotEventsContext.Provider>;
}

export function useBotEvents(): BotEvent[] {
  const ctx = useContext(BotEventsContext);
  if (ctx === null) throw new Error("useBotEvents must be used within BotEventsProvider");
  return ctx;
}
