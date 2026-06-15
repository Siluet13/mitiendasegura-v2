import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { licenses } from "@shared/schema";

export function registerLicenseRoutes(app: Express): void {
  app.get("/api/license/status", isAuthenticated, async (req, res) => {
    const { userId } = requireTenant(req);
    const [lic] = await db.select().from(licenses).where(eq(licenses.ownerId, userId));
    res.json({
      status: lic?.status ?? "pendiente",
      activatedAt: lic?.activatedAt ?? null,
      expiresAt: lic?.expiresAt ?? null,
      suspendedAt: lic?.suspendedAt ?? null,
    });
  });
}
