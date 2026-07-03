/**
 * Reconciliation utilities for Mi Tienda Segura POS.
 *
 * FUENTE DE VERDAD:
 *   1. sales (status = 'active' | 'void')
 *   2. sale_items
 *   3. stock_movements (voidedAt IS NULL = activos)
 *
 * cash_register_sessions.totalSales es DERIVADO → siempre recalculable.
 * products.stock               es DERIVADO → siempre recalculable desde
 *                                            products.initialStock + movements activos.
 *
 * Ambas funciones aceptan un parámetro `tx` para ejecutarse DENTRO de una
 * transacción existente (garantía de atomicidad) o de forma standalone.
 */

import { and, eq, isNull, sum, sql } from "drizzle-orm";
import { db } from "../db";
import { cashRegisterSessions, products, sales, stockMovements } from "@shared/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

// ────────────────────────────────────────────────────────────────────────────
// calculateCashImpact
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el impacto en caja de una venta según su método de pago.
 *
 * Reglas:
 *   cash (o null/legado) → total completo impacta en caja
 *   transfer             → 0 (no impacta en caja)
 *   account              → 0 (cuenta corriente, no impacta en caja)
 *   mixed                → solo la porción en efectivo (paidAmount)
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
      if (sale.paidAmount == null) return total;
      const cash = Number(sale.paidAmount);
      if (!Number.isFinite(cash)) return total;
      // clamp cash portion to [0, total]
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
// recalculateCashSession
// ────────────────────────────────────────────────────────────────────────────

/**
 * Recalculates `cashRegisterSessions.totalSales` from the sum of the CASH
 * IMPACT of all active sales linked to the session.
 *
 * Uses COALESCE(cash_amount, total) for backward compatibility with sales
 * created before payment_method was introduced (where cash_amount IS NULL).
 *
 * Call this INSIDE a db.transaction() after every:
 *   - sale creation
 *   - sale edit
 *   - sale void/delete
 *   - cash-session close
 *
 * Returns the recalculated total.
 */
export async function recalculateCashSession(
  sessionId: string,
  tenantId: string,
  tx: AnyDb = db,
): Promise<number> {
  const [agg] = await tx
    .select({
      total: sum(sql`COALESCE(${sales.cashAmount}, ${sales.total})`),
    })
    .from(sales)
    .where(
      and(
        eq(sales.cashSessionId, sessionId),
        eq(sales.tenantId, tenantId),
        eq(sales.status, "active"),
      ),
    );

  const totalSales = agg?.total ? Number(agg.total) : 0;

  await tx
    .update(cashRegisterSessions)
    .set({ totalSales: String(totalSales) })
    .where(
      and(
        eq(cashRegisterSessions.id, sessionId),
        eq(cashRegisterSessions.tenantId, tenantId),
      ),
    );

  return totalSales;
}

// ────────────────────────────────────────────────────────────────────────────
// recalculateStock
// ────────────────────────────────────────────────────────────────────────────

/**
 * Recalculates `products.stock` from:
 *   products.initialStock
 *   + SUM(stock_movements where tipo = 'entrada' AND voided_at IS NULL)
 *   - SUM(stock_movements where tipo = 'salida' AND voided_at IS NULL)
 *
 * Movimientos anulados (voidedAt IS NOT NULL) se excluyen del cálculo.
 * Guarantees stock >= 0.
 * Updates `products.stock` and `products.updatedAt` in place.
 *
 * Precondition: call FOR UPDATE on the product row before invoking inside a tx.
 * Returns the recalculated stock value.
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
