import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { licenses } from "@shared/schema";

const DEMO_DAYS  = 15;
const GRACE_DAYS = 3;

export function registerLicenseRoutes(app: Express): void {
  /**
   * GET /api/license/status
   *
   * ÚNICA AUTORIDAD para calcular y persistir transiciones de estado.
   * Nunca usar cron, timers ni jobs — toda la lógica vive aquí.
   *
   * Ciclo de vida para usuarios normales:
   *   (sin licencia) → demo (15 días) → gracia (3 días) → vencida
   *
   * MASTER_ADMIN_ID: bypass total, siempre "permanente".
   */
  app.get("/api/license/status", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);

    // ── BYPASS TOTAL: MASTER_ADMIN_ID siempre tiene licencia permanente ──────
    // Este bypass es la primera línea de defensa en el endpoint.
    // Ningún proceso automático puede alcanzar al admin.
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

    const now = new Date();
    let [lic] = await db.select().from(licenses).where(eq(licenses.ownerId, userId));

    // ── CUENTA NUEVA: crear licencia demo automáticamente ──────────────────
    // Se ejecuta solo una vez en el primer login. No requiere acción del admin.
    if (!lic) {
      const demoEndsAt = new Date(now.getTime() + DEMO_DAYS * 24 * 60 * 60 * 1000);
      [lic] = await db
        .insert(licenses)
        .values({
          ownerId:      userId,
          status:       "demo",
          demoEndsAt,
          graceEndsAt:   null,
          lastPaymentAt: null,
          activatedAt:   null,
          expiresAt:     null,
        })
        .returning();
    }

    // ── TRANSICIONES AUTOMÁTICAS DE ESTADO ─────────────────────────────────
    // Solo aplican a "demo" y "gracia". El resto de estados no se toca.
    // Cada transición se ejecuta una sola vez (guard en el status actual).

    if (lic.status === "demo" && lic.demoEndsAt !== null && lic.demoEndsAt <= now) {
      // Demo expiró → pasar a gracia
      const graceEndsAt = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
      [lic] = await db
        .update(licenses)
        .set({ status: "gracia", graceEndsAt, updatedAt: now })
        .where(eq(licenses.ownerId, userId))
        .returning();

    } else if (lic.status === "gracia" && lic.graceEndsAt !== null && lic.graceEndsAt <= now) {
      // Gracia expiró → vencida
      [lic] = await db
        .update(licenses)
        .set({ status: "vencida", updatedAt: now })
        .where(eq(licenses.ownerId, userId))
        .returning();
    }

    res.json({
      status:        lic.status,
      activatedAt:   lic.activatedAt   ?? null,
      expiresAt:     lic.expiresAt     ?? null,
      suspendedAt:   lic.suspendedAt   ?? null,
      demoEndsAt:    lic.demoEndsAt    ?? null,
      graceEndsAt:   lic.graceEndsAt   ?? null,
      lastPaymentAt: lic.lastPaymentAt ?? null,
    });
  }));
}
