/**
 * Reconciliation utilities for Mi Tienda Segura POS.
 *
 * FUENTE DE VERDAD:
 *   1. sales (status = 'active' | 'void')
 *   2. sale_items
 *   3. stock_movements
 *
 * cash_register_sessions.totalSales es DERIVADO → siempre recalculable.
 * products.stock               es DERIVADO → siempre recalculable desde
 *                                            products.initialStock + movements.
 *
 * Ambas funciones aceptan un parámetro `tx` para ejecutarse DENTRO de una
 * transacción existente (garantía de atomicidad) o de forma standalone.
 */

import { and, eq, sum } from "drizzle-orm";
import { db } from "../db";
import { cashRegisterSessions, products, sales, stockMovements } from "@shared/schema";

// Drizzle tx and db share the same query interface; `any` avoids complex
// generic gymnastics while keeping call-sites clean.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

// ────────────────────────────────────────────────────────────────────────────
// recalculateCashSession
// ────────────────────────────────────────────────────────────────────────────

/**
 * Recalculates `cashRegisterSessions.totalSales` from the sum of ALL active
 * sales linked to the session.  Updates the row in place.
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
    .select({ total: sum(sales.total) })
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
 *   + SUM(stock_movements where tipo = 'entrada')
 *   - SUM(stock_movements where tipo = 'salida')
 *
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
