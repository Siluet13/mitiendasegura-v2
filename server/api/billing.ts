/**
 * server/api/billing.ts — endpoints de billing auto-gestionados por el usuario.
 *
 * Todos los pagos (payment, reactivate) pasan por processPayment().
 * Suspend escribe directamente a licenses (no es un pago).
 * MASTER_ADMIN_ID nunca accede a estos endpoints (guard isAdminSelf).
 */
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { businessSettings, licenses } from "@shared/schema";
import { getBillingStatus } from "@shared/billing";
import { processPayment } from "../lib/payment";
import { logEvent } from "../lib/logger";

/**
 * Guard: MASTER_ADMIN_ID no es un cliente y no gestiona billing propio.
 * Retorna true si la request debe ser rechazada.
 */
function isAdminSelf(userId: string, res: any): boolean {
  if (userId === process.env.MASTER_ADMIN_ID) {
    res.status(403).json({ message: "El administrador del sistema no gestiona billing" });
    return true;
  }
  return false;
}

export function registerBillingRoutes(app: Express): void {
  // ── GET /api/billing/status — datos visuales del ciclo de billing ────────────
  // Solo lectura; fuente: business_settings.
  // No decide acceso (eso es checkLicense + licenses.status).
  app.get("/api/billing/status", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);
    if (isAdminSelf(userId, res)) return;

    const [bs] = await db
      .select()
      .from(businessSettings)
      .where(eq(businessSettings.ownerId, userId));

    if (!bs) {
      return res.json({
        status: "active",
        daysLeft: 30,
        billingCycleStart: null,
        billingCycleEnd: null,
        lastPaymentDate: null,
      });
    }

    const billing = getBillingStatus({
      billing_cycle_start: bs.billingCycleStart,
      billing_cycle_end: bs.billingCycleEnd,
      last_payment_date: bs.lastPaymentDate,
    });

    res.json({
      status: billing.status,
      daysLeft: billing.daysLeft,
      billingCycleStart: bs.billingCycleStart,
      billingCycleEnd: bs.billingCycleEnd,
      lastPaymentDate: bs.lastPaymentDate,
    });
  }));

  // ── POST /api/billing/payment — pago auto-gestionado ────────────────────────
  // Usa processPayment() como función central: actualiza licenses + business_settings
  // con expiresAt y lastPaymentAt correctos.
  app.post("/api/billing/payment", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);
    if (isAdminSelf(userId, res)) return;

    const result = await processPayment(userId, userId);
    res.json({ ok: true, expiresAt: result.expiresAt.toISOString(), lastPaymentAt: result.lastPaymentAt.toISOString() });
  }));

  // ── POST /api/billing/suspend — suspensión de cuenta ────────────────────────
  // No es un pago; escribe directamente a licenses.
  app.post("/api/billing/suspend", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);
    if (isAdminSelf(userId, res)) return;

    const now = new Date();

    await db
      .insert(businessSettings)
      .values({ ownerId: userId, nombreNegocio: "", subscriptionStatus: "suspended" })
      .onConflictDoUpdate({
        target: businessSettings.ownerId,
        set: { subscriptionStatus: "suspended", updatedAt: now },
      });

    await db
      .insert(licenses)
      .values({ ownerId: userId, status: "suspendida", suspendedAt: now })
      .onConflictDoUpdate({
        target: licenses.ownerId,
        set: { status: "suspendida", suspendedAt: now, updatedAt: now },
      });

    logEvent({ module: "billing", event: "SUBSCRIPTION_SUSPENDED", level: "warning", message: "Suscripción suspendida", userId, ownerId: userId });
    res.json({ ok: true });
  }));

  // ── POST /api/billing/reactivate — reactivación de cuenta ───────────────────
  // Es equivalente a un pago: usa processPayment() para restablecer
  // licenses.expiresAt y lastPaymentAt correctamente.
  app.post("/api/billing/reactivate", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);
    if (isAdminSelf(userId, res)) return;

    const result = await processPayment(userId, userId);
    logEvent({ module: "billing", event: "SUBSCRIPTION_REACTIVATED", message: "Suscripción reactivada vía pago", userId, ownerId: userId, details: { expiresAt: result.expiresAt.toISOString() } });
    res.json({ ok: true, expiresAt: result.expiresAt.toISOString() });
  }));
}
