import type { Express } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import {
  categories,
  products,
  customers,
  sales,
  saleItems,
  stockMovements,
  businessSettings,
  licenses,
} from "@shared/schema";

const MAX_RESTORE_ROWS = 100_000;

function noTenant(res: any) {
  return res.status(500).json({ message: "Tenant no configurado. Cerrá sesión y volvé a ingresar." });
}

export function registerBackupRoutes(app: Express): void {
  app.get("/api/backup/export", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const [bsData, catsData, prodsData, custsData, salesData, licData] = await Promise.all([
      db.select().from(businessSettings).where(eq(businessSettings.ownerId, userId)),
      db.select().from(categories).where(eq(categories.tenantId, tenantId)),
      db.select().from(products).where(eq(products.tenantId, tenantId)),
      db.select().from(customers).where(eq(customers.tenantId, tenantId)),
      db.select().from(sales).where(eq(sales.tenantId, tenantId)),
      db.select().from(licenses).where(eq(licenses.ownerId, userId)),
    ]);

    const saleIds = salesData.map((s) => s.id);
    const [saleItemsData, stockData] = await Promise.all([
      saleIds.length > 0
        ? db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds))
        : Promise.resolve([]),
      db.select().from(stockMovements).where(eq(stockMovements.tenantId, tenantId)),
    ]);

    const payload = {
      version: "1.0",
      app: "Mi Tienda Segura",
      exportedAt: new Date().toISOString(),
      ownerId: userId,
      tenantId,
      data: {
        businessSettings: bsData[0] ?? null,
        categories: catsData,
        products: prodsData,
        customers: custsData,
        sales: salesData,
        saleItems: saleItemsData,
        stockMovements: stockData,
        license: licData[0] ?? null,
      },
      stats: {
        categories: catsData.length,
        products: prodsData.length,
        customers: custsData.length,
        sales: salesData.length,
        saleItems: saleItemsData.length,
        stockMovements: stockData.length,
      },
    };

    const json = JSON.stringify(payload, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="backup_${date}.json"`);
    res.send(json);
  });

  app.post("/api/backup/restore", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const body = req.body;

    if (body.confirmRestore !== true) {
      return res.status(400).json({ message: "Se requiere confirmación explícita para restaurar (confirmRestore: true)." });
    }

    if (!body?.version || !body?.data) {
      return res.status(400).json({ message: "Formato de backup inválido" });
    }

    if (body.exportedAt && isNaN(Date.parse(body.exportedAt))) {
      return res.status(400).json({ message: "La fecha de exportación del backup es inválida." });
    }

    const { data } = body;

    if (
      !Array.isArray(data.categories) ||
      !Array.isArray(data.products) ||
      !Array.isArray(data.customers) ||
      !Array.isArray(data.sales) ||
      !Array.isArray(data.saleItems) ||
      !Array.isArray(data.stockMovements)
    ) {
      return res.status(400).json({ message: "Estructura de datos inválida" });
    }

    const totalRows =
      data.categories.length +
      data.products.length +
      data.customers.length +
      data.sales.length +
      data.saleItems.length +
      data.stockMovements.length;

    if (totalRows === 0 && !data.businessSettings) {
      return res.status(400).json({ message: "El backup está vacío. No se realizó ninguna restauración." });
    }

    if (totalRows > MAX_RESTORE_ROWS) {
      return res.status(400).json({
        message: `El backup supera el límite de ${MAX_RESTORE_ROWS.toLocaleString("es-AR")} registros (${totalRows.toLocaleString("es-AR")} encontrados). Contactá soporte.`,
      });
    }

    try {
      await db.transaction(async (tx) => {
        await tx.delete(stockMovements).where(eq(stockMovements.tenantId, tenantId));

        const existingSales = await tx
          .select({ id: sales.id })
          .from(sales)
          .where(eq(sales.tenantId, tenantId));
        if (existingSales.length > 0) {
          await tx
            .delete(saleItems)
            .where(inArray(saleItems.saleId, existingSales.map((s) => s.id)));
        }
        await tx.delete(sales).where(eq(sales.tenantId, tenantId));
        await tx.delete(products).where(eq(products.tenantId, tenantId));
        await tx.delete(customers).where(eq(customers.tenantId, tenantId));
        await tx.delete(categories).where(eq(categories.tenantId, tenantId));
        await tx.delete(businessSettings).where(eq(businessSettings.ownerId, userId));

        if (data.businessSettings) {
          await tx.insert(businessSettings).values({ ...data.businessSettings, ownerId: userId });
        }

        if (data.categories.length > 0) {
          await tx.insert(categories).values(
            data.categories.map((c: any) => ({ ...c, ownerId: userId, tenantId }))
          );
        }

        if (data.products.length > 0) {
          await tx.insert(products).values(
            data.products.map((p: any) => ({ ...p, ownerId: userId, tenantId }))
          );
        }

        if (data.customers.length > 0) {
          await tx.insert(customers).values(
            data.customers.map((c: any) => ({ ...c, ownerId: userId, tenantId }))
          );
        }

        if (data.sales.length > 0) {
          await tx.insert(sales).values(
            data.sales.map((s: any) => ({ ...s, ownerId: userId, userId, tenantId }))
          );
        }

        if (data.saleItems.length > 0) {
          await tx.insert(saleItems).values(data.saleItems);
        }

        if (data.stockMovements.length > 0) {
          await tx.insert(stockMovements).values(
            data.stockMovements.map((m: any) => ({ ...m, ownerId: userId, userId, tenantId }))
          );
        }

        if (data.license) {
          const lic = data.license as any;
          await tx
            .insert(licenses)
            .values({
              id: lic.id,
              ownerId: userId,
              status: lic.status ?? "pendiente",
              activatedAt: lic.activatedAt ? new Date(lic.activatedAt) : null,
              expiresAt: lic.expiresAt ? new Date(lic.expiresAt) : null,
              suspendedAt: lic.suspendedAt ? new Date(lic.suspendedAt) : null,
              notes: lic.notes ?? null,
            })
            .onConflictDoUpdate({
              target: licenses.ownerId,
              set: {
                status: lic.status ?? "pendiente",
                activatedAt: lic.activatedAt ? new Date(lic.activatedAt) : null,
                expiresAt: lic.expiresAt ? new Date(lic.expiresAt) : null,
                suspendedAt: lic.suspendedAt ? new Date(lic.suspendedAt) : null,
                notes: lic.notes ?? null,
                updatedAt: new Date(),
              },
            });
        }
      });

      res.json({ ok: true, stats: body.stats });
    } catch (err: any) {
      console.error("Restore error:", err);
      res.status(500).json({ message: err?.message ?? "Error al restaurar el backup" });
    }
  });
}
