import type { Express } from "express";
import { and, eq, sql, sum } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { broadcast } from "../lib/events";
import { logEvent } from "../lib/logger";
import { recalculateCashSession } from "../lib/reconciliation";
import { cashRegisterSessions, sales } from "@shared/schema";

/**
 * Calcula el total de ventas que impactan en caja para una sesión abierta.
 *
 * REGLA: solo la porción en efectivo cuenta.
 *   cash / null (legacy) → sale.total completo
 *   transfer / account   → 0
 *   mixed                → sale.cash_amount (porción efectivo ya calculada)
 *
 * Usa COALESCE(cash_amount, total) para compatibilidad con ventas anteriores
 * a la introducción del campo cash_amount (donde el valor es NULL → trata como efectivo).
 */
async function calcCurrentTotal(sessionId: string): Promise<number> {
  const [agg] = await db
    .select({ total: sum(sql`COALESCE(${sales.cashAmount}, ${sales.total})`) })
    .from(sales)
    .where(and(eq(sales.cashSessionId, sessionId), eq(sales.status, "active")));
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

    let closed: typeof cashRegisterSessions.$inferSelect;
    let totalSales: number;

    try {
      // Wrap in a transaction so the reconciliation and the status update are atomic.
      // FOR UPDATE on the session prevents concurrent closes.
      [closed, totalSales] = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(cashRegisterSessions)
          .where(and(
            eq(cashRegisterSessions.tenantId, tenantId),
            eq(cashRegisterSessions.userId, userId),
            eq(cashRegisterSessions.status, "open"),
          ))
          .limit(1)
          .for("update");

        if (!session) throw Object.assign(new Error("No hay caja abierta"), { status: 404 });

        console.log("[cash] POST /close — sesión encontrada:", session.id);

        // Recalculate totalSales from source of truth inside the transaction
        const total = await recalculateCashSession(session.id, tenantId, tx);
        console.log("[cash] POST /close — totalSales (recalculado):", total);

        const [result] = await tx
          .update(cashRegisterSessions)
          .set({
            status: "closed",
            closedAt: new Date(),
            totalSales: String(total),
            finalAmount: String(Number(session.initialAmount) + total),
          })
          .where(and(
            eq(cashRegisterSessions.id, session.id),
            eq(cashRegisterSessions.tenantId, tenantId),
          ))
          .returning();

        console.log("[cash] POST /close — caja cerrada:", result.id, "finalAmount:", result.finalAmount);
        return [result, total] as const;
      });
    } catch (err: any) {
      logCashError("POST /close", "transaction", err);
      if (err?.status === 404) return res.status(404).json({ message: err.message });
      throw err;
    }

    broadcast(tenantId, { type: "invalidate", entities: ["cash_session"] });
    logEvent({ module: "cash", event: "CASH_CLOSED", message: "Caja cerrada", userId, ownerId: userId, tenantId, details: { sessionId: closed.id, totalSales, finalAmount: Number(closed.finalAmount) } });
    res.json(toResponse(closed, totalSales));
  }));
}
