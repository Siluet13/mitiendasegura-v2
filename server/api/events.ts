import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { subscribe, unsubscribe } from "../lib/events";

export function registerEventsRoutes(app: Express): void {
  app.get("/api/events", isAuthenticated, (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) {
      res.status(500).end();
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    subscribe(tenantId, res);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe(tenantId, res);
    });
  });
}
