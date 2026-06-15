import type { Express } from "express";
import { eq, and, gte, lt, desc, count, sum } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
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

function noTenant(res: any) {
  return res.status(500).json({ message: "Tenant no configurado. Cerrá sesión y volvé a ingresar." });
}

export function registerDashboardRoutes(app: Express): void {
  // ── KPIs ──────────────────────────────────────────────────────────────────
  app.get("/api/dashboard/kpis", isAuthenticated, async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const { start, end } = todayRange();
    const mStart = monthStart();

    const [todaySales, monthSales, activeProductsCount, customersCount] = await Promise.all([
      db.select({ total: sales.total })
        .from(sales)
        .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, start), lt(sales.createdAt, end))),
      db.select({ total: sales.total })
        .from(sales)
        .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, mStart))),
      db.select({ count: count() })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.activo, true))),
      db.select({ count: count() })
        .from(customers)
        .where(eq(customers.tenantId, tenantId)),
    ]);

    res.json({
      salesToday: todaySales.reduce((s, r) => s + Number(r.total), 0),
      salesMonth: monthSales.reduce((s, r) => s + Number(r.total), 0),
      activeProducts: activeProductsCount[0]?.count ?? 0,
      totalCustomers: customersCount[0]?.count ?? 0,
    });
  });

  // ── Stock alerts ──────────────────────────────────────────────────────────
  app.get("/api/dashboard/stock-alerts", isAuthenticated, async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const rows = await db
      .select({ id: products.id, nombre: products.nombre, stock: products.stock, stockMinimo: products.stockMinimo })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.activo, true)))
      .orderBy(products.stock);

    const alerts = rows.filter((p) => p.stock <= p.stockMinimo || p.stock === 0);
    res.json({
      sinStock: alerts.filter((p) => p.stock === 0),
      stockBajo: alerts.filter((p) => p.stock > 0 && p.stock <= p.stockMinimo),
    });
  });

  // ── Top products ──────────────────────────────────────────────────────────
  app.get("/api/dashboard/top-products", isAuthenticated, async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const rows = await db
      .select({
        productId: saleItems.productId,
        nombre: products.nombre,
        unidades: sum(saleItems.cantidad).mapWith(Number),
        importe: sum(saleItems.subtotal).mapWith(Number),
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .leftJoin(products, eq(saleItems.productId, products.id))
      .where(eq(sales.tenantId, tenantId))
      .groupBy(saleItems.productId, products.nombre)
      .orderBy(desc(sum(saleItems.cantidad)))
      .limit(10);

    res.json(
      rows.map((r) => ({
        product_id: r.productId,
        nombre: r.nombre ?? "Producto eliminado",
        unidades: r.unidades ?? 0,
        importe: r.importe ?? 0,
      }))
    );
  });

  // ── Recent sales ──────────────────────────────────────────────────────────
  app.get("/api/dashboard/recent-sales", isAuthenticated, async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const rows = await db
      .select({
        id: sales.id,
        createdAt: sales.createdAt,
        total: sales.total,
        cantidad_productos: count(saleItems.id),
      })
      .from(sales)
      .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
      .where(eq(sales.tenantId, tenantId))
      .groupBy(sales.id, sales.createdAt, sales.total)
      .orderBy(desc(sales.createdAt))
      .limit(10);

    res.json(
      rows.map((s) => ({
        id: s.id,
        created_at: s.createdAt,
        total: Number(s.total),
        cliente: null as string | null,
        cantidad_productos: s.cantidad_productos ?? 0,
      }))
    );
  });

  // ── Sales by day (last 7 days) ────────────────────────────────────────────
  app.get("/api/dashboard/sales-by-day", isAuthenticated, async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const since = daysAgo(6);

    const rows = await db
      .select({ createdAt: sales.createdAt, total: sales.total })
      .from(sales)
      .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, since)))
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

  // ── All dashboard data in a single round-trip ─────────────────────────────
  app.get("/api/dashboard/all", isAuthenticated, async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const { start, end } = todayRange();
    const mStart = monthStart();
    const since = daysAgo(6);

    const [
      todaySales,
      monthSales,
      activeProductsCount,
      customersCount,
      stockRows,
      topProductsRows,
      recentSalesRows,
      salesByDayRows,
    ] = await Promise.all([
      db.select({ total: sales.total })
        .from(sales)
        .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, start), lt(sales.createdAt, end))),
      db.select({ total: sales.total })
        .from(sales)
        .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, mStart))),
      db.select({ count: count() })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.activo, true))),
      db.select({ count: count() })
        .from(customers)
        .where(eq(customers.tenantId, tenantId)),
      db.select({ id: products.id, nombre: products.nombre, stock: products.stock, stockMinimo: products.stockMinimo })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.activo, true)))
        .orderBy(products.stock),
      db.select({
        productId: saleItems.productId,
        nombre: products.nombre,
        unidades: sum(saleItems.cantidad).mapWith(Number),
        importe: sum(saleItems.subtotal).mapWith(Number),
      })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .leftJoin(products, eq(saleItems.productId, products.id))
        .where(eq(sales.tenantId, tenantId))
        .groupBy(saleItems.productId, products.nombre)
        .orderBy(desc(sum(saleItems.cantidad)))
        .limit(10),
      db.select({
        id: sales.id,
        createdAt: sales.createdAt,
        total: sales.total,
        cantidad_productos: count(saleItems.id),
      })
        .from(sales)
        .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
        .where(eq(sales.tenantId, tenantId))
        .groupBy(sales.id, sales.createdAt, sales.total)
        .orderBy(desc(sales.createdAt))
        .limit(10),
      db.select({ createdAt: sales.createdAt, total: sales.total })
        .from(sales)
        .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, since)))
        .orderBy(sales.createdAt),
    ]);

    const alerts = stockRows.filter((p) => p.stock <= p.stockMinimo || p.stock === 0);

    const dayMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const s of salesByDayRows) {
      const key = s.createdAt.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) ?? 0) + Number(s.total));
    }

    res.json({
      kpis: {
        salesToday: todaySales.reduce((s, r) => s + Number(r.total), 0),
        salesMonth: monthSales.reduce((s, r) => s + Number(r.total), 0),
        activeProducts: activeProductsCount[0]?.count ?? 0,
        totalCustomers: customersCount[0]?.count ?? 0,
      },
      stockAlerts: {
        sinStock: alerts.filter((p) => p.stock === 0),
        stockBajo: alerts.filter((p) => p.stock > 0 && p.stock <= p.stockMinimo),
      },
      topProducts: topProductsRows.map((r) => ({
        product_id: r.productId,
        nombre: r.nombre ?? "Producto eliminado",
        unidades: r.unidades ?? 0,
        importe: r.importe ?? 0,
      })),
      recentSales: recentSalesRows.map((s) => ({
        id: s.id,
        created_at: s.createdAt,
        total: Number(s.total),
        cliente: null as string | null,
        cantidad_productos: s.cantidad_productos ?? 0,
      })),
      salesByDay: Array.from(dayMap.entries()).map(([fecha, total]) => ({ fecha, total })),
    });
  });
}
