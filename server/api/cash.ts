import type { Express } from "express";
import { and, eq, sum } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { broadcast } from "../lib/events";
import { cashRegisterSessions, sales } from "@shared/schema";

async function calcCurrentTotal(sessionId: string): Promise<number> {
  const [agg] = await db
    .select({ total: sum(sales.total) })
    .from(sales)
    .where(eq(sales.cashSessionId, sessionId));
  return agg?.total ? Number(agg.total) : 0;
}

function toResponse(session: typeof cashRegisterSessions.$inferSelect, currentTotal: number) {
  return {
    id: session.id,
    tenant_id: session.tenantId,
    user_id: session.userId,
    opened_at: session.openedAt,
    closed_at: session.closedAt,
    initial_amount: session.initialAmount,
    final_amount: session.finalAmount,
    total_sales: session.totalSales,
    status: session.status,
    current_total: currentTotal,
  };
}

export function registerCashRoutes(app: Express): void {
  app.get("/api/cash/current", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return res.json(null);

    const [session] = await db
      .select()
      .from(cashRegisterSessions)
      .where(and(
        eq(cashRegisterSessions.tenantId, tenantId),
        eq(cashRegisterSessions.userId, userId),
        eq(cashRegisterSessions.status, "open"),
      ))
      .limit(1);

    if (!session) return res.json(null);

    const currentTotal = await calcCurrentTotal(session.id);
    res.json(toResponse(session, currentTotal));
  }));

  app.post("/api/cash/open", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant no configurado" });

    const [existing] = await db
      .select({ id: cashRegisterSessions.id })
      .from(cashRegisterSessions)
      .where(and(
        eq(cashRegisterSessions.tenantId, tenantId),
        eq(cashRegisterSessions.userId, userId),
        eq(cashRegisterSessions.status, "open"),
      ))
      .limit(1);

    if (existing) return res.status(409).json({ message: "Ya hay una caja abierta" });

    const initialAmount = Math.max(0, Number(req.body?.initial_amount ?? 0));

    const [session] = await db
      .insert(cashRegisterSessions)
      .values({ tenantId, userId, initialAmount: String(initialAmount) })
      .returning();

    broadcast(tenantId, { type: "invalidate", entities: ["cash_session"] });
    res.json(toResponse(session, 0));
  }));

  app.post("/api/cash/close", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant no configurado" });

    const [session] = await db
      .select()
      .from(cashRegisterSessions)
      .where(and(
        eq(cashRegisterSessions.tenantId, tenantId),
        eq(cashRegisterSessions.userId, userId),
        eq(cashRegisterSessions.status, "open"),
      ))
      .limit(1);

    if (!session) return res.status(404).json({ message: "No hay caja abierta" });

    const totalSales = await calcCurrentTotal(session.id);

    const [closed] = await db
      .update(cashRegisterSessions)
      .set({
        status: "closed",
        closedAt: new Date(),
        totalSales: String(totalSales),
        finalAmount: String(Number(session.initialAmount) + totalSales),
      })
      .where(eq(cashRegisterSessions.id, session.id))
      .returning();

    broadcast(tenantId, { type: "invalidate", entities: ["cash_session"] });
    res.json(toResponse(closed, totalSales));
  }));
}
