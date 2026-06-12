import type { Express, RequestHandler } from "express";
import { eq, desc, count, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { licenses, users, businessSettings, products, customers, sales } from "@shared/schema";
import type { LicenseStatus } from "@shared/schema";

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
        businessSettings.nombreNegocio
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
        licenseStatus: b.licenseStatus ?? "pendiente",
      };
    });

    res.json(result);
  });

  app.put("/api/admin/licenses/:ownerId", isAuthenticated, isAdmin, async (req, res) => {
    const { ownerId } = req.params;
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

    res.json(updated);
  });
}
