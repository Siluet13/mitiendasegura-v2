import type { Express } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  categories,
  products,
  customers,
  sales,
  saleItems,
  stockMovements,
  businessSettings,
} from "@shared/schema";

export function registerBackupRoutes(app: Express): void {
  app.get("/api/backup/export", isAuthenticated, async (req: any, res) => {
    const ownerId = req.user.claims.sub;

    const [bsData, catsData, prodsData, custsData, salesData] = await Promise.all([
      db.select().from(businessSettings).where(eq(businessSettings.ownerId, ownerId)),
      db.select().from(categories).where(eq(categories.ownerId, ownerId)),
      db.select().from(products).where(eq(products.ownerId, ownerId)),
      db.select().from(customers).where(eq(customers.ownerId, ownerId)),
      db.select().from(sales).where(eq(sales.ownerId, ownerId)),
    ]);

    const saleIds = salesData.map((s) => s.id);
    const [saleItemsData, stockData] = await Promise.all([
      saleIds.length > 0
        ? db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds))
        : Promise.resolve([]),
      db.select().from(stockMovements).where(eq(stockMovements.ownerId, ownerId)),
    ]);

    const payload = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      ownerId,
      data: {
        businessSettings: bsData[0] ?? null,
        categories: catsData,
        products: prodsData,
        customers: custsData,
        sales: salesData,
        saleItems: saleItemsData,
        stockMovements: stockData,
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

  app.post("/api/backup/restore", isAuthenticated, async (req: any, res) => {
    const ownerId = req.user.claims.sub;
    const body = req.body;

    if (!body?.version || !body?.data) {
      return res.status(400).json({ message: "Formato de backup inválido" });
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

    try {
      await db.transaction(async (tx) => {
        await tx.delete(stockMovements).where(eq(stockMovements.ownerId, ownerId));

        const existingSales = await tx
          .select({ id: sales.id })
          .from(sales)
          .where(eq(sales.ownerId, ownerId));
        if (existingSales.length > 0) {
          await tx
            .delete(saleItems)
            .where(inArray(saleItems.saleId, existingSales.map((s) => s.id)));
        }
        await tx.delete(sales).where(eq(sales.ownerId, ownerId));
        await tx.delete(products).where(eq(products.ownerId, ownerId));
        await tx.delete(customers).where(eq(customers.ownerId, ownerId));
        await tx.delete(categories).where(eq(categories.ownerId, ownerId));
        await tx.delete(businessSettings).where(eq(businessSettings.ownerId, ownerId));

        if (data.businessSettings) {
          await tx.insert(businessSettings).values({ ...data.businessSettings, ownerId });
        }

        if (data.categories.length > 0) {
          await tx.insert(categories).values(
            data.categories.map((c: any) => ({ ...c, ownerId }))
          );
        }

        if (data.products.length > 0) {
          await tx.insert(products).values(
            data.products.map((p: any) => ({ ...p, ownerId }))
          );
        }

        if (data.customers.length > 0) {
          await tx.insert(customers).values(
            data.customers.map((c: any) => ({ ...c, ownerId }))
          );
        }

        if (data.sales.length > 0) {
          await tx.insert(sales).values(
            data.sales.map((s: any) => ({ ...s, ownerId, userId: ownerId }))
          );
        }

        if (data.saleItems.length > 0) {
          await tx.insert(saleItems).values(data.saleItems);
        }

        if (data.stockMovements.length > 0) {
          await tx.insert(stockMovements).values(
            data.stockMovements.map((m: any) => ({ ...m, ownerId, userId: ownerId }))
          );
        }
      });

      res.json({ ok: true, stats: body.stats });
    } catch (err: any) {
      console.error("Restore error:", err);
      res.status(500).json({ message: err?.message ?? "Error al restaurar el backup" });
    }
  });
}
