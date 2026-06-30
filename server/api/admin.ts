import type { Express, RequestHandler } from "express";
import { eq, desc, count, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { licenses, users, businessSettings, tenants, products, customers, sales } from "@shared/schema";
import type { LicenseStatus } from "@shared/schema";
import { wrapAsync } from "../lib/asyncHandler";
import { broadcast } from "../lib/events";

const CYCLE_DAYS = 30;

const isAdmin: RequestHandler = (req, res, next) => {
  const user = req.user as any;
  if (!req.isAuthenticated() || !user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const adminId = process.env.MASTER_ADMIN_ID;
  if (!adminId || user.claims.sub !== adminId) {
    return res.status(403).json({ message: "Acceso denegado" });
  }
  next();
};

async function getTenantId(ownerId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.ownerId, ownerId))
    .limit(1);
  return row?.id ?? null;
}

async function broadcastToTenant(ownerId: string, entities: string[]): Promise<void> {
  try {
    const tenantId = await getTenantId(ownerId);
    if (tenantId) {
      broadcast(tenantId, { type: "invalidate", entities });
    }
  } catch {}
}

export function registerAdminRoutes(app: Express): void {
  app.get("/api/admin/me", isAuthenticated, (req: any, res) => {
    const adminId = process.env.MASTER_ADMIN_ID;
    const isAdminUser = !!adminId && req.user.claims.sub === adminId;
    res.json({ isAdmin: isAdminUser });
  });

  app.get("/api/admin/businesses", isAuthenticated, isAdmin, async (_req, res) => {
    const businessList = await db
      .select({
        ownerId: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        registeredAt: users.createdAt,
        licenseStatus: licenses.status,
        licenseActivatedAt: licenses.activatedAt,
        licenseExpiresAt: licenses.expiresAt,
        licenseNotes: licenses.notes,
        nombreNegocio: businessSettings.nombreNegocio,
        billingCycleStart: businessSettings.billingCycleStart,
        billingCycleEnd: businessSettings.billingCycleEnd,
        lastPaymentDate: businessSettings.lastPaymentDate,
        subscriptionStatus: businessSettings.subscriptionStatus,
        productCount: count(products.id),
        customerCount: count(customers.id),
      })
      .from(users)
      .leftJoin(licenses, eq(licenses.ownerId, users.id))
      .leftJoin(businessSettings, eq(businessSettings.ownerId, users.id))
      .leftJoin(products, eq(products.ownerId, users.id))
      .leftJoin(customers, eq(customers.ownerId, users.id))
      .groupBy(
        users.id,
        users.email,
        users.firstName,
        users.lastName,
        users.createdAt,
        licenses.status,
        licenses.activatedAt,
        licenses.expiresAt,
        licenses.notes,
        businessSettings.nombreNegocio,
        businessSettings.billingCycleStart,
        businessSettings.billingCycleEnd,
        businessSettings.lastPaymentDate,
        businessSettings.subscriptionStatus,
      )
      .orderBy(desc(users.createdAt));

    const saleStats = await db
      .select({
        ownerId: sales.ownerId,
        saleCount: count(sales.id),
        lastSaleAt: sql<string | null>`MAX(${sales.createdAt})`,
      })
      .from(sales)
      .groupBy(sales.ownerId);

    const saleMap = new Map(saleStats.map((s) => [s.ownerId, s]));

    const result = businessList.map((b) => {
      const ss = saleMap.get(b.ownerId);
      return {
        ...b,
        saleCount: ss?.saleCount ?? 0,
        lastSaleAt: ss?.lastSaleAt ?? null,
        licenseStatus: (b.licenseStatus ?? "pendiente") as LicenseStatus,
      };
    });

    res.json(result);
  });

  app.get("/api/admin/businesses/:ownerId", isAuthenticated, isAdmin, wrapAsync(async (req, res) => {
    const ownerId = String(req.params.ownerId);

    const [row] = await db
      .select({
        ownerId: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        registeredAt: users.createdAt,
        licenseStatus: licenses.status,
        licenseActivatedAt: licenses.activatedAt,
        licenseExpiresAt: licenses.expiresAt,
        licenseSuspendedAt: licenses.suspendedAt,
        licenseNotes: licenses.notes,
        nombreNegocio: businessSettings.nombreNegocio,
        billingCycleStart: businessSettings.billingCycleStart,
        billingCycleEnd: businessSettings.billingCycleEnd,
        lastPaymentDate: businessSettings.lastPaymentDate,
        subscriptionStatus: businessSettings.subscriptionStatus,
        tenantId: tenants.id,
      })
      .from(users)
      .leftJoin(licenses, eq(licenses.ownerId, users.id))
      .leftJoin(businessSettings, eq(businessSettings.ownerId, users.id))
      .leftJoin(tenants, eq(tenants.ownerId, users.id))
      .where(eq(users.id, ownerId));

    if (!row) return res.status(404).json({ message: "Comercio no encontrado" });

    res.json({
      ...row,
      licenseStatus: (row.licenseStatus ?? "pendiente") as LicenseStatus,
    });
  }));

  app.put("/api/admin/businesses/:ownerId", isAuthenticated, isAdmin, wrapAsync(async (req, res) => {
    const ownerId = String(req.params.ownerId);
    const { nombreNegocio, billingCycleEnd } = req.body as {
      nombreNegocio?: string;
      billingCycleEnd?: string | null;
    };

    const now = new Date();
    const settingsFields: Record<string, unknown> = { updatedAt: now };

    if (nombreNegocio !== undefined && nombreNegocio.trim() !== "") {
      settingsFields.nombreNegocio = nombreNegocio.trim();
    }
    if (billingCycleEnd !== undefined && billingCycleEnd !== null) {
      settingsFields.billingCycleEnd = new Date(billingCycleEnd);
    }

    if (Object.keys(settingsFields).length > 1) {
      await db
        .update(businessSettings)
        .set(settingsFields as any)
        .where(eq(businessSettings.ownerId, ownerId));
    }

    if (billingCycleEnd !== undefined && billingCycleEnd !== null) {
      const expDate = new Date(billingCycleEnd);
      await db
        .insert(licenses)
        .values({ ownerId, status: "activa", expiresAt: expDate })
        .onConflictDoUpdate({
          target: licenses.ownerId,
          set: { expiresAt: expDate, updatedAt: now },
        });
    }

    await broadcastToTenant(ownerId, ["settings", "business_settings"]);

    res.json({ ok: true });
  }));

  app.put("/api/admin/licenses/:ownerId", isAuthenticated, isAdmin, wrapAsync(async (req, res) => {
    const ownerId = String(req.params.ownerId);
    const { status, notes, expiresAt } = req.body as {
      status: LicenseStatus;
      notes?: string;
      expiresAt?: string | null;
    };

    const valid: LicenseStatus[] = ["activa", "pendiente", "suspendida", "vencida"];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const now = new Date();
    const setFields: Record<string, unknown> = {
      status,
      updatedAt: now,
      notes: notes ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    };

    if (status === "activa") setFields.activatedAt = now;
    if (status === "suspendida") setFields.suspendedAt = now;

    const [updated] = await db
      .insert(licenses)
      .values({ ownerId, status, notes: notes ?? null, expiresAt: expiresAt ? new Date(expiresAt) : null })
      .onConflictDoUpdate({ target: licenses.ownerId, set: setFields })
      .returning();

    if (status === "suspendida") {
      await db
        .update(businessSettings)
        .set({ subscriptionStatus: "suspended", updatedAt: now })
        .where(eq(businessSettings.ownerId, ownerId));
    } else if (status === "activa") {
      await db
        .update(businessSettings)
        .set({ subscriptionStatus: "active", updatedAt: now })
        .where(eq(businessSettings.ownerId, ownerId));
    }

    await broadcastToTenant(ownerId, ["settings", "business_settings"]);

    res.json(updated);
  }));

  app.get("/api/admin/dev/stats", isAuthenticated, isAdmin, wrapAsync(async (_req, res) => {
    const [biz, usr, prod, sale] = await Promise.all([
      db.select({ c: count() }).from(tenants),
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(products),
      db.select({ c: count() }).from(sales),
    ]);

    res.json({
      totalBusinesses: Number(biz[0]?.c ?? 0),
      totalUsers: Number(usr[0]?.c ?? 0),
      totalProducts: Number(prod[0]?.c ?? 0),
      totalSales: Number(sale[0]?.c ?? 0),
      serverUptime: Math.floor(process.uptime()),
      appVersion: process.env.npm_package_version ?? "1.0.0",
      buildDate: process.env.BUILD_DATE ?? null,
      nodeVersion: process.version,
    });
  }));

  app.post("/api/admin/billing/payment/:ownerId", isAuthenticated, isAdmin, wrapAsync(async (req, res) => {
    const ownerId = String(req.params.ownerId);
    const now = new Date();
    const end = new Date(now.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000);

    await db
      .update(businessSettings)
      .set({
        lastPaymentDate: now,
        billingCycleStart: now,
        billingCycleEnd: end,
        subscriptionStatus: "active",
        updatedAt: now,
      })
      .where(eq(businessSettings.ownerId, ownerId));

    await db
      .insert(licenses)
      .values({ ownerId, status: "activa" })
      .onConflictDoUpdate({
        target: licenses.ownerId,
        set: {
          status: "activa" as LicenseStatus,
          activatedAt: now,
          expiresAt: end,
          updatedAt: now,
        },
      });

    await broadcastToTenant(ownerId, ["settings", "business_settings"]);

    res.json({ ok: true });
  }));
}
