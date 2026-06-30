import type { Express } from "express";
import { and, eq, gte, sum } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { broadcast } from "../lib/events";
import { cashRegisterSessions, sales } from "@shared/schema";

export function registerCashRoutes(app: Express): void {
  app.get("/api/cash/current", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant no configurado" });

    const [session] = await db
      .select()
      .from(cashRegisterSessions)
      .where(and(
        eq(cashRegisterSessions.tenantId, tenantId),
        eq(cashRegisterSessions.status, "open"),
      ));

    if (!session) return res.json(null);

    const [agg] = await db
      .select({ total: sum(sales.total) })
      .from(sales)
      .where(and(
        eq(sales.tenantId, tenantId),
        gte(sales.createdAt, session.openedAt),
      ));

    res.json({
      id: session.id,
      tenant_id: session.tenantId,
      user_id: session.userId,
      opened_at: session.openedAt,
      closed_at: session.closedAt,
      initial_amount: session.initialAmount,
      final_amount: session.finalAmount,
      total_sales: session.totalSales,
      status: session.status,
      current_total: agg?.total ? Number(agg.total) : 0,
    });
  }));

  app.post("/api/cash/open", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant no configurado" });

    const [existing] = await db
      .select({ id: cashRegisterSessions.id })
      .from(cashRegisterSessions)
      .where(and(
        eq(cashRegisterSessions.tenantId, tenantId),
        eq(cashRegisterSessions.status, "open"),
      ));

    if (existing) return res.status(400).json({ message: "Ya hay una caja abierta" });

    const initialAmount = Math.max(0, Number(req.body.initial_amount ?? 0));

    const [session] = await db
      .insert(cashRegisterSessions)
      .values({ tenantId, userId, initialAmount: String(initialAmount) })
      .returning();

    res.json({
      id: session.id,
      tenant_id: session.tenantId,
      user_id: session.userId,
      opened_at: session.openedAt,
      closed_at: null,
      initial_amount: session.initialAmount,
      final_amount: null,
      total_sales: null,
      status: session.status,
      current_total: 0,
    });

    broadcast(tenantId, { type: "invalidate", entities: ["cash_session"] });
  }));

  app.post("/api/cash/close", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant no configurado" });

    const [session] = await db
      .select()
      .from(cashRegisterSessions)
      .where(and(
        eq(cashRegisterSessions.tenantId, tenantId),
        eq(cashRegisterSessions.status, "open"),
      ));

    if (!session) return res.status(400).json({ message: "No hay caja abierta" });

    const [agg] = await db
      .select({ total: sum(sales.total) })
      .from(sales)
      .where(and(
        eq(sales.tenantId, tenantId),
        gte(sales.createdAt, session.openedAt),
      ));

    const totalSales = agg?.total ? Number(agg.total) : 0;
    const finalAmount = totalSales + Number(session.initialAmount);

    const [closed] = await db
      .update(cashRegisterSessions)
      .set({
        status: "closed",
        closedAt: new Date(),
        totalSales: String(totalSales),
        finalAmount: String(finalAmount),
      })
      .where(eq(cashRegisterSessions.id, session.id))
      .returning();

    res.json({
      id: closed.id,
      tenant_id: closed.tenantId,
      user_id: closed.userId,
      opened_at: closed.openedAt,
      closed_at: closed.closedAt,
      initial_amount: closed.initialAmount,
      total_sales: closed.totalSales,
      final_amount: closed.finalAmount,
      status: closed.status,
      current_total: totalSales,
    });

    broadcast(tenantId, { type: "invalidate", entities: ["cash_session"] });
  }));
}
