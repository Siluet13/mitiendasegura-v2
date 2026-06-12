import type { Express } from "express";
import { eq, and, gte, lt, lte, desc, count, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { products, customers, sales, saleItems } from "@shared/schema";

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function registerDashboardRoutes(app: Express): void {
  app.get("/api/dashboard/kpis", isAuthenticated, async (req: any, res) => {
    const ownerId = req.user.claims.sub;
    const { start, end } = todayRange();
    const mStart = monthStart();

    const [todaySales, monthSales, activeProductsCount, customersCount] = await Promise.all([
      db.select({ total: sales.total })
        .from(sales)
        .where(and(eq(sales.ownerId, ownerId), gte(sales.createdAt, start), lt(sales.createdAt, end))),
      db.select({ total: sales.total })
        .from(sales)
        .where(and(eq(sales.ownerId, ownerId), gte(sales.createdAt, mStart))),
      db.select({ count: count() })
        .from(products)
        .where(and(eq(products.ownerId, ownerId), eq(products.activo, true))),
      db.select({ count: count() })
        .from(customers)
        .where(eq(customers.ownerId, ownerId)),
    ]);

    res.json({
      salesToday: todaySales.reduce((s, r) => s + Number(r.total), 0),
      salesMonth: monthSales.reduce((s, r) => s + Number(r.total), 0),
      activeProducts: activeProductsCount[0]?.count ?? 0,
      totalCustomers: customersCount[0]?.count ?? 0,
    });
  });

  app.get("/api/dashboard/stock-alerts", isAuthenticated, async (req: any, res) => {
    const ownerId = req.user.claims.sub;
    const rows = await db
      .select({ id: products.id, nombre: products.nombre, stock: products.stock, stockMinimo: products.stockMinimo })
      .from(products)
      .where(and(eq(products.ownerId, ownerId), eq(products.activo, true)))
      .orderBy(products.stock);

    const alerts = rows.filter((p) => p.stock <= p.stockMinimo || p.stock === 0);
    res.json({
      sinStock: alerts.filter((p) => p.stock === 0),
      stockBajo: alerts.filter((p) => p.stock > 0 && p.stock <= p.stockMinimo),
    });
  });

  app.get("/api/dashboard/top-products", isAuthenticated, async (req: any, res) => {
    const ownerId = req.user.claims.sub;
    const rows = await db
      .select({
        productId: saleItems.productId,
        cantidad: saleItems.cantidad,
        subtotal: saleItems.subtotal,
        nombre: products.nombre,
      })
      .from(saleItems)
      .leftJoin(sales, eq(saleItems.saleId, sales.id))
      .leftJoin(products, eq(saleItems.productId, products.id))
      .where(eq(sales.ownerId, ownerId));

    const map = new Map<string, { product_id: string; nombre: string; unidades: number; importe: number }>();
    for (const item of rows) {
      if (!item.productId) continue;
      const ex = map.get(item.productId);
      if (ex) {
        ex.unidades += item.cantidad ?? 0;
        ex.importe += Number(item.subtotal ?? 0);
      } else {
        map.set(item.productId, {
          product_id: item.productId,
          nombre: item.nombre ?? "Producto eliminado",
          unidades: item.cantidad ?? 0,
          importe: Number(item.subtotal ?? 0),
        });
      }
    }
    res.json(Array.from(map.values()).sort((a, b) => b.unidades - a.unidades).slice(0, 10));
  });

  app.get("/api/dashboard/recent-sales", isAuthenticated, async (req: any, res) => {
    const ownerId = req.user.claims.sub;
    const rows = await db
      .select({
        id: sales.id,
        createdAt: sales.createdAt,
        total: sales.total,
        customerId: sales.customerId,
      })
      .from(sales)
      .where(eq(sales.ownerId, ownerId))
      .orderBy(desc(sales.createdAt))
      .limit(10);

    const result = await Promise.all(
      rows.map(async (s) => {
        const itemCount = await db
          .select({ count: count() })
          .from(saleItems)
          .where(eq(saleItems.saleId, s.id));
        return {
          id: s.id,
          created_at: s.createdAt,
          total: Number(s.total),
          cliente: null as string | null,
          cantidad_productos: itemCount[0]?.count ?? 0,
        };
      })
    );
    res.json(result);
  });

  app.get("/api/dashboard/sales-by-day", isAuthenticated, async (req: any, res) => {
    const ownerId = req.user.claims.sub;
    const since = daysAgo(6);

    const rows = await db
      .select({ createdAt: sales.createdAt, total: sales.total })
      .from(sales)
      .where(and(eq(sales.ownerId, ownerId), gte(sales.createdAt, since)))
      .orderBy(sales.createdAt);

    const map = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const s of rows) {
      const key = s.createdAt.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + Number(s.total));
    }
    res.json(Array.from(map.entries()).map(([fecha, total]) => ({ fecha, total })));
  });
}
