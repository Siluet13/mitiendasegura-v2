/**
 * stockAlerts.ts
 *
 * Helper central de evaluación de alertas de stock.
 *
 * DISEÑO:
 *  - Función pura: recibe valores antes/después y devuelve la notificación
 *    correspondiente (o null si no hubo cambio de estado).
 *  - Sin efectos secundarios, sin acceso a DB.
 *  - El CALLER es responsable de llamar a broadcastStockAlert() con el resultado.
 *
 * EXTENSIBILIDAD (futuras alertas de vencimientos / lotes):
 *  - Agregar nuevas funciones puras del mismo estilo (evaluateExpiryAlerts, etc.).
 *  - El Centro de Alertas consume GET /api/stock-alerts, que puede enriquecerse
 *    con más categorías sin romper la arquitectura existente.
 *  - El campo `metadata` en el payload de broadcast está reservado para contexto
 *    adicional (lote, fecha de vencimiento) sin necesidad de nuevas tablas.
 */

import { broadcast } from "./events";

// ── Estado de stock ───────────────────────────────────────────────────────────
export type StockState = "sin_stock" | "stock_bajo" | "normal";

/**
 * Clasifica el estado de stock de un producto.
 * Nota: si stockMinimo = 0, no existe estado "stock_bajo" — va directo a "sin_stock".
 */
export function getStockState(stock: number, stockMinimo: number): StockState {
  if (stock <= 0) return "sin_stock";
  if (stockMinimo > 0 && stock <= stockMinimo) return "stock_bajo";
  return "normal";
}

// ── Notificación ─────────────────────────────────────────────────────────────
export type AlertKind = "sin_stock" | "stock_bajo" | "recuperado";

export interface StockAlertNotification {
  kind: AlertKind;
  productId: string;
  productName: string;
  stock: number;
  stockMinimo: number;
  /** Reservado para futuras alertas (lote, vencimiento, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Evalúa si una transición de stock genera una alerta.
 *
 * Transiciones que disparan notificación:
 *   normal   → stock_bajo  → "stock_bajo"   ("alcanzó el stock mínimo")
 *   normal   → sin_stock   → "sin_stock"    ("quedó sin stock")
 *   stock_bajo → sin_stock → "sin_stock"    ("quedó sin stock")
 *   sin_stock  → stock_bajo → "stock_bajo"  ("stock bajo, aún no suficiente")
 *   stock_bajo → normal    → "recuperado"   ("volvió a tener stock")
 *   sin_stock  → normal    → "recuperado"   ("volvió a tener stock")
 *
 * Sin notificación si el estado no cambió (previene duplicados por diseño).
 *
 * @returns StockAlertNotification | null
 */
export function evaluateStockAlerts(
  productId: string,
  productName: string,
  oldStock: number,
  newStock: number,
  stockMinimo: number,
): StockAlertNotification | null {
  const oldState = getStockState(oldStock, stockMinimo);
  const newState = getStockState(newStock, stockMinimo);

  if (oldState === newState) return null; // mismo estado → sin notificación

  let kind: AlertKind | null = null;

  if (newState === "sin_stock") {
    kind = "sin_stock";
  } else if (newState === "stock_bajo") {
    kind = "stock_bajo";
  } else if (newState === "normal") {
    // Solo notificamos recuperación si el estado anterior era problemático
    kind = "recuperado";
  }

  if (!kind) return null;

  return { kind, productId, productName, stock: newStock, stockMinimo };
}

/**
 * Emite la notificación de alerta de stock por SSE.
 * Debe llamarse DESPUÉS de que el UPDATE de stock fue commiteado (o fuera de tx).
 */
export function broadcastStockAlert(
  tenantId: string,
  notification: StockAlertNotification,
): void {
  broadcast(tenantId, {
    type: "stock_alert",
    ...notification,
  });
}
