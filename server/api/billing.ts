import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { businessSettings, licenses } from "@shared/schema";
import { getBillingStatus } from "@shared/billing";
import { logEvent } from "../lib/logger";

const CYCLE_DAYS = 30;

function cycleEnd(from: Date): Date {
  return new Date(from.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000);
}

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
        daysLeft: CYCLE_DAYS,
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

  app.post("/api/billing/payment", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);
    if (isAdminSelf(userId, res)) return;

    const now = new Date();
    const end = cycleEnd(now);

    await db
      .insert(businessSettings)
      .values({
        ownerId: userId,
        nombreNegocio: "",
        lastPaymentDate: now,
        billingCycleStart: now,
        billingCycleEnd: end,
        subscriptionStatus: "active",
      })
      .onConflictDoUpdate({
        target: businessSettings.ownerId,
        set: {
          lastPaymentDate: now,
          billingCycleStart: now,
          billingCycleEnd: end,
          subscriptionStatus: "active",
          updatedAt: now,
        },
      });

    await db
      .insert(licenses)
      .values({ ownerId: userId, status: "activa", activatedAt: now, lastPaymentAt: now })
      .onConflictDoUpdate({
        target: licenses.ownerId,
        set: { status: "activa", activatedAt: now, lastPaymentAt: now, updatedAt: now },
      });

    logEvent({ module: "billing", event: "PAYMENT_REGISTERED", message: "Pago registrado", userId, ownerId: userId, details: { cycleEnd: end.toISOString() } });
    res.json({ ok: true });
  }));

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

  app.post("/api/billing/reactivate", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);
    if (isAdminSelf(userId, res)) return;

    const now = new Date();
    const end = cycleEnd(now);

    await db
      .insert(businessSettings)
      .values({
        ownerId: userId,
        nombreNegocio: "",
        subscriptionStatus: "active",
        billingCycleStart: now,
        billingCycleEnd: end,
      })
      .onConflictDoUpdate({
        target: businessSettings.ownerId,
        set: {
          subscriptionStatus: "active",
          billingCycleStart: now,
          billingCycleEnd: end,
          updatedAt: now,
        },
      });

    await db
      .insert(licenses)
      .values({ ownerId: userId, status: "activa", activatedAt: now })
      .onConflictDoUpdate({
        target: licenses.ownerId,
        set: { status: "activa", activatedAt: now, updatedAt: now },
      });

    logEvent({ module: "billing", event: "SUBSCRIPTION_REACTIVATED", message: "Suscripción reactivada", userId, ownerId: userId });
    res.json({ ok: true });
  }));
}
