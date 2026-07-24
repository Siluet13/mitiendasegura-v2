import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { broadcast } from "../lib/events";
import { logEvent } from "../lib/logger";
import { calculateCashSummary, type CashSummary } from "../lib/reconciliation";
import { cashRegisterSessions } from "@shared/schema";

/**
 * Resumen vacío para sesiones sin ventas (evita undefined en la respuesta).
 */
const EMPTY_SUMMARY: CashSummary = {
  cashTotal: 0,
  transferTotal: 0,
  accountTotal: 0,
  collectedTotal: 0,
  netSales: 0,
  salesCount: 0,
  salesByPaymentMethod: { cash: 0, transfer: 0, account: 0, mixed: 0 },
  accountPaymentsCash: 0,
  accountPaymentsTransfer: 0,
  accountPaymentsTotal: 0,
};

/**
 * Construye la respuesta completa de la sesión incluyendo el resumen financiero.
 *
 * current_total = collectedTotal (efectivo + transferencias) para backward compat
 * con el frontend que consume este campo para mostrar el total en caja.
 */
function toResponse(
  session: typeof cashRegisterSessions.$inferSelect,
  summary: CashSummary,
) {
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
    // Resumen financiero completo (fuente: calculateCashSummary)
    current_total: summary.collectedTotal,           // ventas cobradas + cobros cta. corriente
    cash_total: summary.cashTotal,                   // efectivo de ventas
    transfer_total: summary.transferTotal,           // transferencias de ventas
    account_total: summary.accountTotal,             // cuenta corriente pendiente (no entra a caja)
    net_sales: summary.netSales,                     // total bruto de todas las ventas activas
    sales_count: summary.salesCount,
    sales_by_payment_method: summary.salesByPaymentMethod,
    account_payments_cash: summary.accountPaymentsCash,       // cobros cta. corriente en efectivo
    account_payments_transfer: summary.accountPaymentsTransfer, // cobros cta. corriente por transferencia
    account_payments_total: summary.accountPaymentsTotal,     // total cobros de cta. corriente
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

  // ── GET /api/cash/current ──────────────────────────────────────────────────
  // Devuelve la sesión abierta del usuario con resumen financiero completo.
  // Usa calculateCashSummary() como única fuente de verdad financiera.
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

    let summary: CashSummary;
    try {
      summary = await calculateCashSummary(session.id, tenantId);
      console.log(
        "[cash] GET /current — cobrado:", summary.collectedTotal,
        "efectivo:", summary.cashTotal,
        "transferencia:", summary.transferTotal,
        "cta.cte:", summary.accountTotal,
      );
    } catch (err: any) {
      logCashError("GET /current", "calculateCashSummary", err);
      throw err;
    }

    res.json(toResponse(session, summary));
  }));

  // ── POST /api/cash/open ────────────────────────────────────────────────────
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
    res.json(toResponse(session, EMPTY_SUMMARY));
  }));

  // ── POST /api/cash/close ───────────────────────────────────────────────────
  // Cierra la sesión y retorna resumen financiero completo para mostrar al usuario.
  // Usa calculateCashSummary() dentro de la transacción para garantizar consistencia.
  app.post("/api/cash/close", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    console.log("[cash] POST /close — userId:", userId, "tenantId:", tenantId ?? "null");
    if (!tenantId) return res.status(400).json({ message: "Tenant no configurado. Cerrá sesión y volvé a ingresar." });

    let closed: typeof cashRegisterSessions.$inferSelect;
    let closeSummary: CashSummary;

    try {
      // Transacción atómica con FOR UPDATE para prevenir cierres concurrentes.
      [closed, closeSummary] = await db.transaction(async (tx) => {
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

        // Calcular resumen financiero completo desde la fuente de verdad (sales)
        const summary = await calculateCashSummary(session.id, tenantId, tx);
        const collectedTotal = summary.collectedTotal;

        console.log(
          "[cash] POST /close — cobrado:", collectedTotal,
          "efectivo:", summary.cashTotal,
          "transferencia:", summary.transferTotal,
          "cta.cte:", summary.accountTotal,
          "ventas brutas:", summary.netSales,
          "cant. ventas:", summary.salesCount,
        );

        // Actualizar sesión: cerrar + guardar totales
        const [result] = await tx
          .update(cashRegisterSessions)
          .set({
            status: "closed",
            closedAt: new Date(),
            totalSales: String(collectedTotal),
            finalAmount: String(Number(session.initialAmount) + collectedTotal),
          })
          .where(and(
            eq(cashRegisterSessions.id, session.id),
            eq(cashRegisterSessions.tenantId, tenantId),
          ))
          .returning();

        console.log("[cash] POST /close — caja cerrada:", result.id, "finalAmount:", result.finalAmount);
        return [result, summary] as const;
      });
    } catch (err: any) {
      logCashError("POST /close", "transaction", err);
      if (err?.status === 404) return res.status(404).json({ message: err.message });
      throw err;
    }

    broadcast(tenantId, { type: "invalidate", entities: ["cash_session"] });
    logEvent({
      module: "cash",
      event: "CASH_CLOSED",
      message: "Caja cerrada",
      userId,
      ownerId: userId,
      tenantId,
      details: {
        sessionId: closed.id,
        cashTotal: closeSummary.cashTotal,
        transferTotal: closeSummary.transferTotal,
        accountTotal: closeSummary.accountTotal,
        collectedTotal: closeSummary.collectedTotal,
        netSales: closeSummary.netSales,
        salesCount: closeSummary.salesCount,
        finalAmount: Number(closed.finalAmount),
      },
    });

    res.json(toResponse(closed, closeSummary));
  }));
}
