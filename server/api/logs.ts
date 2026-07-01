import type { Express } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { logEvent, type LogLevel } from "../lib/logger";

const VALID_LEVELS: LogLevel[] = ["info", "warning", "error"];
const ALLOWED_MODULES = new Set(["sync", "offline", "pwa"]);

export function registerLogsRoutes(app: Express): void {
  app.post("/api/log/event", isAuthenticated, (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const { event, module: mod, message, level, details } = req.body ?? {};

    if (
      !event || typeof event !== "string" ||
      !mod || !ALLOWED_MODULES.has(String(mod)) ||
      !message || typeof message !== "string"
    ) {
      return res.status(400).json({ ok: false });
    }

    const safeLevel: LogLevel = VALID_LEVELS.includes(level) ? level : "info";

    logEvent({
      level: safeLevel,
      module: String(mod),
      event: String(event).slice(0, 128),
      message: String(message).slice(0, 500),
      userId,
      tenantId,
      ownerId: userId,
      details: details && typeof details === "object" && !Array.isArray(details)
        ? details as Record<string, unknown>
        : null,
    });

    res.json({ ok: true });
  });
}
