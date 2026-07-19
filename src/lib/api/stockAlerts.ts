/**
 * stockAlerts.ts — API cliente para el Centro de Alertas de Stock.
 *
 * El servidor calcula el estado en tiempo real desde products.stock y
 * products.stock_minimo — sin tabla adicional.
 */

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as any).message ?? res.statusText);
  }
  return res.json();
}

export interface StockAlertProduct {
  id: string;
  nombre: string;
  sku: string | null;
  stock: number;
  stockMinimo: number;
  /** "sin_stock" = stock === 0, "stock_bajo" = 0 < stock <= stockMinimo */
  estado: "sin_stock" | "stock_bajo";
}

export interface StockAlertsData {
  sinStock: StockAlertProduct[];
  stockBajo: StockAlertProduct[];
  /** Total de alertas activas */
  total: number;
}

export async function getStockAlerts(): Promise<StockAlertsData> {
  return apiFetch("/api/stock-alerts");
}
