import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { licenses } from "@shared/schema";

export function registerLicenseRoutes(app: Express): void {
  app.get("/api/license/status", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);

    // ── BYPASS TOTAL: MASTER_ADMIN_ID siempre tiene licencia permanente ──────
    // Este bypass es la primera línea de defensa en el endpoint.
    // Ningún proceso automático (demo, gracia, expiración) puede alcanzar al admin.
    if (userId === process.env.MASTER_ADMIN_ID) {
      return res.json({
        status: "permanente",
        activatedAt: null,
        expiresAt: null,
        suspendedAt: null,
        demoEndsAt: null,
        graceEndsAt: null,
        lastPaymentAt: null,
      });
    }

    const [lic] = await db.select().from(licenses).where(eq(licenses.ownerId, userId));
    res.json({
      status: lic?.status ?? "pendiente",
      activatedAt: lic?.activatedAt ?? null,
      expiresAt: lic?.expiresAt ?? null,
      suspendedAt: lic?.suspendedAt ?? null,
      demoEndsAt: lic?.demoEndsAt ?? null,
      graceEndsAt: lic?.graceEndsAt ?? null,
      lastPaymentAt: lic?.lastPaymentAt ?? null,
    });
  }));
}
