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

export function registerBillingRoutes(app: Express): void {
  app.get("/api/billing/status", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);

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
    const now = new Date();
    const end = cycleEnd(now);

    await db
      .update(businessSettings)
      .set({
        lastPaymentDate: now,
        billingCycleStart: now,
        billingCycleEnd: end,
        subscriptionStatus: "active",
        updatedAt: now,
      })
      .where(eq(businessSettings.ownerId, userId));

    await db
      .update(licenses)
      .set({ status: "activa", activatedAt: now, updatedAt: now })
      .where(eq(licenses.ownerId, userId));

    logEvent({ module: "billing", event: "PAYMENT_REGISTERED", message: "Pago registrado", userId, ownerId: userId, details: { cycleEnd: end.toISOString() } });
    res.json({ ok: true });
  }));

  app.post("/api/billing/suspend", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);
    const now = new Date();

    await db
      .update(businessSettings)
      .set({ subscriptionStatus: "suspended", updatedAt: now })
      .where(eq(businessSettings.ownerId, userId));

    await db
      .update(licenses)
      .set({ status: "suspendida", suspendedAt: now, updatedAt: now })
      .where(eq(licenses.ownerId, userId));

    logEvent({ module: "billing", event: "SUBSCRIPTION_SUSPENDED", level: "warning", message: "Suscripción suspendida", userId, ownerId: userId });
    res.json({ ok: true });
  }));

  app.post("/api/billing/reactivate", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId } = requireTenant(req);
    const now = new Date();
    const end = cycleEnd(now);

    await db
      .update(businessSettings)
      .set({
        subscriptionStatus: "active",
        billingCycleStart: now,
        billingCycleEnd: end,
        updatedAt: now,
      })
      .where(eq(businessSettings.ownerId, userId));

    await db
      .update(licenses)
      .set({ status: "activa", activatedAt: now, updatedAt: now })
      .where(eq(licenses.ownerId, userId));

    logEvent({ module: "billing", event: "SUBSCRIPTION_REACTIVATED", message: "Suscripción reactivada", userId, ownerId: userId });
    res.json({ ok: true });
  }));
}
