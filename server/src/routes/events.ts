import { Router } from "express";
import type { BotEvent } from "@quotation/shared";
import { requireAuth } from "../middleware/requireAuth.js";
import { eventBus } from "../events/bus.js";

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

eventsRouter.get("/", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const onEvent = (event: BotEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  eventBus.on("event", onEvent);

  // A real (named) event rather than a bare comment, so the client can detect it via
  // addEventListener and notice if heartbeats stop arriving — a plain comment ping is
  // invisible to EventSource's message handling and can't be used to detect a stale connection.
  const heartbeat = setInterval(() => res.write("event: heartbeat\ndata: {}\n\n"), 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    eventBus.off("event", onEvent);
  });
});
