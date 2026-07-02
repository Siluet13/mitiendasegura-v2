import type { Express } from "express";
import { and, eq, sum } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { broadcast } from "../lib/events";
import { logEvent } from "../lib/logger";
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

function logCashError(endpoint: string, label: string, err: any): void {
  console.error(
    `[cash] ${endpoint} — ERROR en ${label}:`,
    "\n  err.message     :", err?.message,
    "\n  err.code        :", err?.code,
    "\n  err.cause.msg   :", err?.cause?.message,
    "\n  err.cause.code  :", err?.cause?.code,
    "\n  err.stack       :", err?.stack,
  );
}

export function registerCashRoutes(app: Express): void {
  app.get("/api/cash/current", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    console.log("[cash] GET /current — userId:", userId, "tenantId:", tenantId ?? "null");
    if (!tenantId) return res.json(null);

    let session: typeof cashRegisterSessions.$inferSelect | undefined;
    try {
      [session] = await db
        .select()
        .from(cashRegisterSessions)
        .where(and(
          eq(cashRegisterSessions.tenantId, tenantId),
          eq(cashRegisterSessions.userId, userId),
          eq(cashRegisterSessions.status, "open"),
        ))
        .limit(1);
      console.log("[cash] GET /current — sesión:", session?.id ?? "ninguna");
    } catch (err: any) {
      logCashError("GET /current", "select cashRegisterSessions", err);
      throw err;
    }

    if (!session) return res.json(null);

    let currentTotal = 0;
    try {
      currentTotal = await calcCurrentTotal(session.id);
      console.log("[cash] GET /current — total calculado:", currentTotal);
    } catch (err: any) {
      logCashError("GET /current", "calcCurrentTotal", err);
      throw err;
    }

    res.json(toResponse(session, currentTotal));
  }));

  app.post("/api/cash/open", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    console.log("[cash] POST /open — userId:", userId, "tenantId:", tenantId ?? "null");
    if (!tenantId) return res.status(400).json({ message: "Tenant no configurado. Cerrá sesión y volvé a ingresar." });

    let existing: { id: string } | undefined;
    try {
      [existing] = await db
        .select({ id: cashRegisterSessions.id })
        .from(cashRegisterSessions)
        .where(and(
          eq(cashRegisterSessions.tenantId, tenantId),
          eq(cashRegisterSessions.userId, userId),
          eq(cashRegisterSessions.status, "open"),
        ))
        .limit(1);
    } catch (err: any) {
      logCashError("POST /open", "select existing session", err);
      throw err;
    }

    if (existing) return res.status(409).json({ message: "Ya hay una caja abierta" });

    const initialAmount = Math.max(0, Number(req.body?.initial_amount ?? 0));

    let session: typeof cashRegisterSessions.$inferSelect;
    try {
      [session] = await db
        .insert(cashRegisterSessions)
        .values({ tenantId, userId, initialAmount: String(initialAmount) })
        .returning();
      console.log("[cash] POST /open — sesión creada:", session.id, "monto:", initialAmount);
    } catch (err: any) {
      logCashError("POST /open", "insert cashRegisterSessions", err);
      throw err;
    }

    broadcast(tenantId, { type: "invalidate", entities: ["cash_session"] });
    logEvent({ module: "cash", event: "CASH_OPENED", message: "Caja abierta", userId, ownerId: userId, tenantId, details: { sessionId: session.id, initialAmount } });
    res.json(toResponse(session, 0));
  }));

  app.post("/api/cash/close", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    console.log("[cash] POST /close — userId:", userId, "tenantId:", tenantId ?? "null");
    if (!tenantId) return res.status(400).json({ message: "Tenant no configurado. Cerrá sesión y volvé a ingresar." });

    let session: typeof cashRegisterSessions.$inferSelect | undefined;
    try {
      [session] = await db
        .select()
        .from(cashRegisterSessions)
        .where(and(
          eq(cashRegisterSessions.tenantId, tenantId),
          eq(cashRegisterSessions.userId, userId),
          eq(cashRegisterSessions.status, "open"),
        ))
        .limit(1);
      console.log("[cash] POST /close — sesión encontrada:", session?.id ?? "ninguna");
    } catch (err: any) {
      logCashError("POST /close", "select open session", err);
      throw err;
    }

    if (!session) return res.status(404).json({ message: "No hay caja abierta" });

    let totalSales = 0;
    try {
      totalSales = await calcCurrentTotal(session.id);
      console.log("[cash] POST /close — totalSales:", totalSales);
    } catch (err: any) {
      logCashError("POST /close", "calcCurrentTotal", err);
      throw err;
    }

    let closed: typeof cashRegisterSessions.$inferSelect;
    try {
      [closed] = await db
        .update(cashRegisterSessions)
        .set({
          status: "closed",
          closedAt: new Date(),
          totalSales: String(totalSales),
          finalAmount: String(Number(session.initialAmount) + totalSales),
        })
        .where(eq(cashRegisterSessions.id, session.id))
        .returning();
      console.log("[cash] POST /close — caja cerrada:", closed.id, "finalAmount:", closed.finalAmount);
    } catch (err: any) {
      logCashError("POST /close", "update cashRegisterSessions", err);
      throw err;
    }

    broadcast(tenantId, { type: "invalidate", entities: ["cash_session"] });
    logEvent({ module: "cash", event: "CASH_CLOSED", message: "Caja cerrada", userId, ownerId: userId, tenantId, details: { sessionId: session.id, totalSales, finalAmount: Number(session.initialAmount) + totalSales } });
    res.json(toResponse(closed, totalSales));
  }));
}
