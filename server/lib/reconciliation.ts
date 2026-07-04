/**
 * Reconciliation & financial utilities for Mi Tienda Segura POS.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              FUENTE ÚNICA DE VERDAD: tabla `sales`          ║
 * ║                                                              ║
 * ║  Toda la información financiera se deriva exclusivamente     ║
 * ║  desde sales. Queda prohibido calcular importes de caja      ║
 * ║  con lógica distinta en distintos módulos.                   ║
 * ║                                                              ║
 * ║  calculateCashSummary() es la única función autorizada      ║
 * ║  para producir cifras financieras de una sesión de caja.     ║
 * ║                                                              ║
 * ║  cash_register_sessions.totalSales  → DERIVADO              ║
 * ║  products.stock                     → DERIVADO              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { and, count, eq, isNull, sql, sum, SQL, gte, lt } from "drizzle-orm";
import { db } from "../db";
import { cashRegisterSessions, products, sales, stockMovements } from "@shared/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

// ────────────────────────────────────────────────────────────────────────────
// CashSummary — única estructura financiera de caja
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resumen financiero completo de una sesión de caja.
 *
 * REGLAS DE NEGOCIO:
 *   Caja = dinero físicamente cobrado = efectivo + transferencias
 *   Cuenta corriente NO entra a caja (es crédito diferido)
 *   Las ventas anuladas (void) nunca participan en ningún cálculo
 *
 * Campos:
 *   cashTotal     = efectivo puro (ventas 'cash' + porción efectivo de mixtos)
 *   transferTotal = transferencias (ventas 'transfer' + porción transfer de mixtos)
 *   accountTotal  = cuenta corriente (pendiente de cobro, NO entra a caja)
 *   collectedTotal= cashTotal + transferTotal  ← total que ingresa físicamente
 *   netSales      = total bruto (todas las ventas activas, todos los métodos)
 */
export interface CashSummary {
  /** Porción cobrada en efectivo. */
  cashTotal: number;
  /** Porción cobrada por transferencia. */
  transferTotal: number;
  /** Ventas en cuenta corriente (pendientes de cobro, no ingresan a caja). */
  accountTotal: number;
  /** Total físicamente cobrado = cashTotal + transferTotal. */
  collectedTotal: number;
  /** Monto bruto total de ventas activas (todos los métodos de pago). */
  netSales: number;
  /** Cantidad de ventas activas en la sesión. */
  salesCount: number;
  /** Desglose de cantidad de transacciones por método de pago. */
  salesByPaymentMethod: {
    cash: number;
    transfer: number;
    account: number;
    mixed: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// calculateCashImpact — impacto en efectivo de una sola venta (al escribir)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calcula la porción en EFECTIVO que una venta aporta a la columna cash_amount.
 * Se llama en el momento de crear/editar una venta para pre-computar el valor.
 *
 * Nota: la porción en transferencia se almacena en transfer_amount por separado.
 * El total cobrado (cash + transfer) se agrega en calculateCashSummary.
 *
 * Reglas:
 *   cash (o null/legado) → total completo
 *   transfer             → 0
 *   account              → 0
 *   mixed                → solo la porción en efectivo (paidAmount), clamp [0, total]
 */
export function calculateCashImpact(sale: {
  total: string | number;
  paymentMethod?: string | null;
  paidAmount?: string | number | null;
}): number {
  const total = Number(sale.total);
  if (!Number.isFinite(total) || total < 0) return 0;

  switch (sale.paymentMethod) {
    case "transfer":
    case "account":
      return 0;
    case "mixed": {
      // Si paidAmount es null/undefined para un pago mixto, la porción en efectivo
      // es 0 (la transferencia cubre el total). Nunca defaultear a total para evitar
      // sobreconteo cuando transfer_amount también tiene valor.
      if (sale.paidAmount == null) return 0;
      const cash = Number(sale.paidAmount);
      if (!Number.isFinite(cash)) return 0;
      return Math.min(Math.max(0, cash), total);
    }
    case "cash":
    case null:
    case undefined:
    default:
      return total;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// calculateCashSummary — fuente única de verdad financiera de una sesión
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el resumen financiero completo de una sesión de caja en UNA sola
 * consulta SQL agregada.
 *
 * ESTA ES LA ÚNICA FUNCIÓN AUTORIZADA PARA PRODUCIR CIFRAS DE CAJA.
 * Todos los endpoints (GET /cash/current, POST /cash/close, dashboard)
 * deben reutilizar esta función. Está prohibido duplicar esta lógica.
 *
 * Backward compatibility:
 *   COALESCE(cash_amount, total)    → ventas sin cash_amount (pre-feature) = cash completo
 *   COALESCE(transfer_amount, 0)    → ventas sin transfer_amount = sin transferencia
 *   COALESCE(credit_amount, 0)      → ventas sin credit_amount = sin cta. corriente
 *
 * Solo ventas con status = 'active' participan. Las anuladas se excluyen.
 */
export async function calculateCashSummary(
  sessionId: string,
  tenantId: string,
  tx: AnyDb = db,
): Promise<CashSummary> {
  const [agg] = await tx
    .select({
      cashTotal:     sum(sql`COALESCE(${sales.cashAmount}, ${sales.total})`),
      transferTotal: sum(sql`COALESCE(${sales.transferAmount}, 0)`),
      accountTotal:  sum(sql`COALESCE(${sales.creditAmount}, 0)`),
      netSales:      sum(sales.total),
      salesCount:    count(),
      countCash: sum(
        sql`CASE WHEN ${sales.paymentMethod} IS NULL OR ${sales.paymentMethod} = 'cash' THEN 1 ELSE 0 END`,
      ),
      countTransfer: sum(
        sql`CASE WHEN ${sales.paymentMethod} = 'transfer' THEN 1 ELSE 0 END`,
      ),
      countAccount: sum(
        sql`CASE WHEN ${sales.paymentMethod} = 'account' THEN 1 ELSE 0 END`,
      ),
      countMixed: sum(
        sql`CASE WHEN ${sales.paymentMethod} = 'mixed' THEN 1 ELSE 0 END`,
      ),
    })
    .from(sales)
    .where(
      and(
        eq(sales.cashSessionId, sessionId),
        eq(sales.tenantId, tenantId),
        eq(sales.status, "active"),
      ),
    );

  const cashTotal     = agg?.cashTotal     ? Number(agg.cashTotal)     : 0;
  const transferTotal = agg?.transferTotal ? Number(agg.transferTotal) : 0;
  const accountTotal  = agg?.accountTotal  ? Number(agg.accountTotal)  : 0;

  return {
    cashTotal,
    transferTotal,
    accountTotal,
    collectedTotal: cashTotal + transferTotal,
    netSales:    agg?.netSales    ? Number(agg.netSales)    : 0,
    salesCount:  agg?.salesCount  ? Number(agg.salesCount)  : 0,
    salesByPaymentMethod: {
      cash:     agg?.countCash     ? Number(agg.countCash)     : 0,
      transfer: agg?.countTransfer ? Number(agg.countTransfer) : 0,
      account:  agg?.countAccount  ? Number(agg.countAccount)  : 0,
      mixed:    agg?.countMixed    ? Number(agg.countMixed)    : 0,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// calculateSalesSummaryForRange — resumen financiero para un rango de fechas
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resumen financiero de ventas para un rango de fechas (dashboard/reportes).
 * Misma fórmula que CashSummary pero sin el scope de sesión.
 */
export interface DateRangeSummary {
  netSales: number;
  cashTotal: number;
  transferTotal: number;
  accountTotal: number;
  collectedTotal: number;
  salesCount: number;
}

/**
 * Calcula el resumen financiero de ventas activas para un tenant + filtro de fecha.
 * Reutiliza la misma fórmula que calculateCashSummary() para garantizar
 * consistencia entre caja y dashboard. Prohibido duplicar esta lógica en dashboard.ts.
 *
 * @param tenantId - ID del tenant
 * @param dateFilter - Expresión SQL de rango de fechas (gte/lt de createdAt)
 */
export async function calculateSalesSummaryForRange(
  tenantId: string,
  dateFilter: SQL<unknown> | undefined,
  tx: AnyDb = db,
): Promise<DateRangeSummary> {
  const [agg] = await tx
    .select({
      netSales:      sum(sales.total),
      cashTotal:     sum(sql`COALESCE(${sales.cashAmount}, ${sales.total})`),
      transferTotal: sum(sql`COALESCE(${sales.transferAmount}, 0)`),
      accountTotal:  sum(sql`COALESCE(${sales.creditAmount}, 0)`),
      salesCount:    count(),
    })
    .from(sales)
    .where(
      and(
        eq(sales.tenantId, tenantId),
        eq(sales.status, "active"),
        dateFilter,
      ),
    );

  const cashTotal     = agg?.cashTotal     ? Number(agg.cashTotal)     : 0;
  const transferTotal = agg?.transferTotal ? Number(agg.transferTotal) : 0;

  return {
    netSales:       agg?.netSales    ? Number(agg.netSales)    : 0,
    cashTotal,
    transferTotal,
    accountTotal:   agg?.accountTotal ? Number(agg.accountTotal) : 0,
    collectedTotal: cashTotal + transferTotal,
    salesCount:     agg?.salesCount  ? Number(agg.salesCount)  : 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// recalculateCashSession
// ────────────────────────────────────────────────────────────────────────────

/**
 * Sincroniza cashRegisterSessions.totalSales con el total cobrado real
 * (efectivo + transferencias) derivado exclusivamente desde la tabla sales.
 *
 * Internamente usa calculateCashSummary() — no duplica lógica.
 * Llamar DENTRO de una transacción después de cada venta, edición o anulación.
 *
 * Retorna el collectedTotal actualizado.
 */
export async function recalculateCashSession(
  sessionId: string,
  tenantId: string,
  tx: AnyDb = db,
): Promise<number> {
  const summary = await calculateCashSummary(sessionId, tenantId, tx);
  const collectedTotal = summary.collectedTotal;

  await tx
    .update(cashRegisterSessions)
    .set({ totalSales: String(collectedTotal) })
    .where(
      and(
        eq(cashRegisterSessions.id, sessionId),
        eq(cashRegisterSessions.tenantId, tenantId),
      ),
    );

  return collectedTotal;
}

// ────────────────────────────────────────────────────────────────────────────
// recalculateStock
// ────────────────────────────────────────────────────────────────────────────

/**
 * Recalcula products.stock desde:
 *   products.initialStock
 *   + SUM(entradas con voidedAt IS NULL)
 *   - SUM(salidas con voidedAt IS NULL)
 *
 * Movimientos anulados (voidedAt IS NOT NULL) se excluyen.
 * Garantiza stock >= 0.
 * Precondición: usar FOR UPDATE en el producto antes de llamar dentro de una tx.
 */
export async function recalculateStock(
  productId: string,
  tenantId: string,
  tx: AnyDb = db,
): Promise<number> {
  const [prod] = await tx
    .select({ initialStock: products.initialStock })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));

  if (!prod) return 0;

  const [entradas] = await tx
    .select({ total: sum(stockMovements.cantidad) })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.productId, productId),
        eq(stockMovements.tenantId, tenantId),
        eq(stockMovements.tipo, "entrada"),
        isNull(stockMovements.voidedAt),
      ),
    );

  const [salidas] = await tx
    .select({ total: sum(stockMovements.cantidad) })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.productId, productId),
        eq(stockMovements.tenantId, tenantId),
        eq(stockMovements.tipo, "salida"),
        isNull(stockMovements.voidedAt),
      ),
    );

  const computed = Math.max(
    0,
    prod.initialStock +
      (entradas?.total ? Number(entradas.total) : 0) -
      (salidas?.total ? Number(salidas.total) : 0),
  );

  await tx
    .update(products)
    .set({ stock: computed, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));

  return computed;
}
