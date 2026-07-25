async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  return res.json();
}

/**
 * Desglose de cantidad de ventas por método de pago en la sesión.
 */
export interface SalesByPaymentMethod {
  cash: number;
  transfer: number;
  account: number;
  mixed: number;
}

/**
 * Sesión de caja con resumen financiero completo.
 *
 * REGLAS:
 *   current_total  = efectivo + transferencias (total cobrado, para mostrar en caja)
 *   cash_total     = solo efectivo
 *   transfer_total = solo transferencias
 *   account_total  = cuenta corriente (no entra a caja)
 *   net_sales      = ventas brutas (todos los métodos, sin anuladas)
 */
export interface CashSession {
  id: string;
  tenant_id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  initial_amount: string;
  final_amount: string | null;
  total_sales: string | null;
  status: "open" | "closed";
  /** Total cobrado = efectivo + transferencias. Usado en barra de caja. */
  current_total: number;
  /** Solo la porción en efectivo. */
  cash_total: number;
  /** Solo la porción en transferencias. */
  transfer_total: number;
  /** Cuenta corriente (no ingresó a caja). */
  account_total: number;
  /** Total bruto de ventas activas (todos los métodos de pago). */
  net_sales: number;
  /** Cantidad de ventas activas en la sesión. */
  sales_count: number;
  /** Desglose de transacciones por método de pago. */
  sales_by_payment_method: SalesByPaymentMethod;
  /** Cobros de deuda de cuenta corriente recibidos en efectivo. */
  account_payments_cash: number;
  /** Cobros de deuda de cuenta corriente recibidos por transferencia. */
  account_payments_transfer: number;
  /** Total cobrado de cuentas corrientes (efectivo + transferencia). */
  account_payments_total: number;
}

export async function getCashSession(): Promise<CashSession | null> {
  return apiFetch("/api/cash/current");
}

export async function openCash(initialAmount: number): Promise<CashSession> {
  return apiFetch("/api/cash/open", {
    method: "POST",
    body: JSON.stringify({ initial_amount: initialAmount }),
  });
}

export async function closeCash(): Promise<CashSession> {
  return apiFetch("/api/cash/close", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
