import type { Express } from "express";
import { eq, and, or, isNull, gte, lt, desc, count, sum } from "drizzle-orm";
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

function scopeWhere(
  tenantCol: any,
  ownerCol: any,
  tenantId: string | null,
  userId: string,
) {
  if (tenantId) {
    return or(eq(tenantCol, tenantId), and(isNull(tenantCol), eq(ownerCol, userId)));
  }
  return eq(ownerCol, userId);
}

export function registerDashboardRoutes(app: Express): void {
  // ── KPIs ──────────────────────────────────────────────────────────────────
  app.get("/api/dashboard/kpis", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const { start, end } = todayRange();
    const mStart = monthStart();

    const salesScope = scopeWhere(sales.tenantId, sales.ownerId, tenantId, userId);
    const prodScope = scopeWhere(products.tenantId, products.ownerId, tenantId, userId);
    const custScope = scopeWhere(customers.tenantId, customers.ownerId, tenantId, userId);

    const [todaySales, monthSales, activeProductsCount, customersCount] = await Promise.all([
      db.select({ total: sales.total })
        .from(sales)
        .where(and(salesScope, gte(sales.createdAt, start), lt(sales.createdAt, end))),
      db.select({ total: sales.total })
        .from(sales)
        .where(and(salesScope, gte(sales.createdAt, mStart))),
      db.select({ count: count() })
        .from(products)
        .where(and(prodScope, eq(products.activo, true))),
      db.select({ count: count() })
        .from(customers)
        .where(custScope),
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
    const { userId, tenantId } = requireTenant(req);
    const rows = await db
      .select({ id: products.id, nombre: products.nombre, stock: products.stock, stockMinimo: products.stockMinimo })
      .from(products)
      .where(and(scopeWhere(products.tenantId, products.ownerId, tenantId, userId), eq(products.activo, true)))
      .orderBy(products.stock);

    const alerts = rows.filter((p) => p.stock <= p.stockMinimo || p.stock === 0);
    res.json({
      sinStock: alerts.filter((p) => p.stock === 0),
      stockBajo: alerts.filter((p) => p.stock > 0 && p.stock <= p.stockMinimo),
    });
  });

  // ── Top products ──────────────────────────────────────────────────────────
  app.get("/api/dashboard/top-products", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);

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
      .where(scopeWhere(sales.tenantId, sales.ownerId, tenantId, userId))
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
    const { userId, tenantId } = requireTenant(req);

    const rows = await db
      .select({
        id: sales.id,
        createdAt: sales.createdAt,
        total: sales.total,
        cantidad_productos: count(saleItems.id),
      })
      .from(sales)
      .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
      .where(scopeWhere(sales.tenantId, sales.ownerId, tenantId, userId))
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
    const { userId, tenantId } = requireTenant(req);
    const since = daysAgo(6);

    const rows = await db
      .select({ createdAt: sales.createdAt, total: sales.total })
      .from(sales)
      .where(and(scopeWhere(sales.tenantId, sales.ownerId, tenantId, userId), gte(sales.createdAt, since)))
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
    const { userId, tenantId } = requireTenant(req);
    const { start, end } = todayRange();
    const mStart = monthStart();
    const since = daysAgo(6);

    const salesScope = scopeWhere(sales.tenantId, sales.ownerId, tenantId, userId);
    const prodScope = scopeWhere(products.tenantId, products.ownerId, tenantId, userId);
    const custScope = scopeWhere(customers.tenantId, customers.ownerId, tenantId, userId);

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
        .where(and(salesScope, gte(sales.createdAt, start), lt(sales.createdAt, end))),
      db.select({ total: sales.total })
        .from(sales)
        .where(and(salesScope, gte(sales.createdAt, mStart))),
      db.select({ count: count() })
        .from(products)
        .where(and(prodScope, eq(products.activo, true))),
      db.select({ count: count() })
        .from(customers)
        .where(custScope),
      db.select({ id: products.id, nombre: products.nombre, stock: products.stock, stockMinimo: products.stockMinimo })
        .from(products)
        .where(and(prodScope, eq(products.activo, true)))
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
        .where(salesScope)
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
        .where(salesScope)
        .groupBy(sales.id, sales.createdAt, sales.total)
        .orderBy(desc(sales.createdAt))
        .limit(10),
      db.select({ createdAt: sales.createdAt, total: sales.total })
        .from(sales)
        .where(and(salesScope, gte(sales.createdAt, since)))
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
