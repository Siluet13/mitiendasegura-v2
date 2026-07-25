import { ConflictError } from "./errors";

export { ConflictError };

const API = "";

export type Category = {
  id: string;
  ownerId: string;
  nombre: string;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  ownerId: string;
  categoryId: string | null;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  codigoBarras: string | null;
  codigo_barras: string | null;
  precio: string | number;
  costo: string | number;
  stock: number;
  stockMinimo: number;
  stock_minimo: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  category_id: string | null;
  categories?: { nombre: string } | null;
};

export type Customer = {
  id: string;
  ownerId: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
  balance?: string | null; // saldo de cuenta corriente (de customer_accounts via LEFT JOIN)
};

export type CustomerAccountMovement = {
  id: string;
  tenantId: string;
  customerId: string;
  type: "sale" | "payment" | "sale_void" | "sale_edit" | "adjustment";
  referenceId: string | null;
  referenceType: string | null;
  amount: string;
  balanceAfter: string;
  observacion: string | null;
  paymentMethod: string | null;
  createdAt: string;
};

export type CustomerAccountData = {
  customer: Customer;
  balance: string;
  movements: CustomerAccountMovement[];
};

export type Sale = {
  id: string;
  ownerId: string;
  userId: string;
  customerId: string | null;
  receiptNumber: string | null;
  total: string | number;
  // Método de pago (null = legado, tratado como cash)
  paymentMethod: string | null;
  paidAmount: string | number | null;
  creditAmount: string | number | null;
  transferAmount: string | number | null;
  cashAmount: string | number | null;
  observacion: string | null;
  cashSessionId: string | null;
  status: string;
  createdAt: string;
};

export type SaleItem = {
  id: string;
  saleId: string;
  productId: string;
  cantidad: number;
  precioUnitario: string | number;
  subtotal: string | number;
  createdAt: string;
  products?: { nombre: string; sku: string | null } | null;
};

export type SaleWithItems = Sale & { sale_items: SaleItem[] };

export type SaleItemInput = { product_id: string; cantidad: number };

export type StockMovement = {
  id: string;
  ownerId: string;
  userId: string;
  productId: string;
  tipo: "entrada" | "salida";
  cantidad: number;
  observacion: string | null;
  referenciaTipo: string | null;
  referenciaId: string | null;
  // Soft delete / anulación
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: string;
  products?: { nombre: string; sku: string | null } | null;
};

export type ProductInput = {
  nombre: string;
  descripcion?: string | null;
  sku?: string | null;
  codigo_barras?: string | null;
  precio: number;
  costo: number;
  stock: number;
  stock_minimo: number;
  category_id?: string | null;
  activo: boolean;
  offline_id?: string;
};

export type StockMovementInput = {
  product_id: string;
  tipo: "entrada" | "salida";
  cantidad: number;
  observacion?: string | null;
};

async function apiFetch<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 5000;
  const timerId = setTimeout(
    () => controller.abort(new DOMException("Timeout", "TimeoutError")),
    timeoutMs,
  );
  const signal = options?.signal ?? controller.signal;
  try {
    const res = await fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
      signal,
    });
    clearTimeout(timerId);
    if (res.status === 409) throw new ConflictError();
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message ?? res.statusText);
    }
    return res.json();
  } catch (e) {
    clearTimeout(timerId);
    throw e;
  }
}

// ── Categories ────────────────────────────────────────────────────────────────
export async function listCategories(): Promise<Category[]> {
  return apiFetch("/api/categories");
}

export async function createCategory(input: { nombre: string }) {
  return apiFetch("/api/categories", { method: "POST", body: JSON.stringify(input), timeoutMs: 3000 });
}

export async function updateCategory(id: string, input: { nombre: string }, knownUpdatedAt?: string | null) {
  const headers: Record<string, string> = {};
  if (knownUpdatedAt) headers["X-If-Unmodified-Since"] = knownUpdatedAt;
  return apiFetch(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(input), headers });
}

export async function deleteCategory(id: string) {
  return apiFetch(`/api/categories/${id}`, { method: "DELETE" });
}

// ── Products ──────────────────────────────────────────────────────────────────
export async function listProducts(): Promise<Product[]> {
  return apiFetch("/api/products");
}

export type ProductSearchResult = {
  id: string;
  nombre: string;
  sku: string | null;
  codigoBarras: string | null;
  stock: number;
  categoryNombre: string | null;
};

export async function searchProducts(q: string, limit = 20): Promise<ProductSearchResult[]> {
  if (!q.trim()) return [];
  const sp = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  return apiFetch(`/api/products/search?${sp.toString()}`);
}

export async function createProduct(input: ProductInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/products", { method: "POST", body: JSON.stringify(input), timeoutMs: 3000 });
}

export async function updateProduct(id: string, input: ProductInput, knownUpdatedAt?: string | null) {
  const headers: Record<string, string> = {};
  if (knownUpdatedAt) headers["X-If-Unmodified-Since"] = knownUpdatedAt;
  return apiFetch(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(input), headers });
}

export async function deleteProduct(id: string) {
  return apiFetch(`/api/products/${id}`, { method: "DELETE" });
}

// ── Customers ─────────────────────────────────────────────────────────────────
export type CustomerInput = {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  observaciones?: string | null;
};

export async function listCustomers(): Promise<Customer[]> {
  return apiFetch("/api/customers");
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  return apiFetch("/api/customers", { method: "POST", body: JSON.stringify(input), timeoutMs: 3000 });
}

export async function updateCustomer(id: string, input: CustomerInput, knownUpdatedAt?: string | null): Promise<Customer> {
  const headers: Record<string, string> = {};
  if (knownUpdatedAt) headers["X-If-Unmodified-Since"] = knownUpdatedAt;
  return apiFetch(`/api/customers/${id}`, { method: "PUT", body: JSON.stringify(input), headers });
}

export async function deleteCustomer(id: string) {
  return apiFetch(`/api/customers/${id}`, { method: "DELETE" });
}

export async function getCustomerAccount(id: string): Promise<CustomerAccountData> {
  return apiFetch(`/api/customers/${id}/account`, { timeoutMs: 8000 });
}

export async function registerCustomerPayment(
  id: string,
  input: { amount: number; observacion?: string | null; payment_method: "cash" | "transfer" },
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/customers/${id}/payment`, {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: 8000,
  });
}

// ── Sales ─────────────────────────────────────────────────────────────────────
export async function listSales(): Promise<Sale[]> {
  return apiFetch("/api/sales");
}

export async function getSaleWithItems(id: string): Promise<SaleWithItems | null> {
  return apiFetch(`/api/sales/${id}`);
}

export type SalePaymentInput = {
  payment_method?: "cash" | "transfer" | "account" | "mixed" | null;
  paid_amount?: number | null;
  credit_amount?: number | null;
  transfer_amount?: number | null;
};

export async function createSale(input: {
  items: SaleItemInput[];
  observacion?: string | null;
  customer_id?: string | null;
  client_id?: string | null;
} & SalePaymentInput) {
  return apiFetch<{ id: string; receiptNumber: string | null }>("/api/sales", {
    method: "POST",
    body: JSON.stringify({
      items: input.items,
      observacion: input.observacion,
      customer_id: input.customer_id,
      client_id: input.client_id ?? null,
      payment_method: input.payment_method ?? null,
      paid_amount: input.paid_amount ?? null,
      credit_amount: input.credit_amount ?? null,
      transfer_amount: input.transfer_amount ?? null,
    }),
    timeoutMs: 3000,
  });
}

export async function updateSale(
  id: string,
  input: { items: SaleItemInput[]; observacion?: string | null; customer_id?: string | null } & SalePaymentInput
) {
  return apiFetch<Sale>(`/api/sales/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
    timeoutMs: 8000,
  });
}

export async function voidSale(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/sales/${id}`, {
    method: "DELETE",
    timeoutMs: 8000,
  });
}

// ── Stock Movements ───────────────────────────────────────────────────────────
export async function listStockMovements(params: {
  productId?: string | null;
  q?: string;
  tipo?: "entrada" | "salida" | null;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
} = {}): Promise<StockMovement[]> {
  const sp = new URLSearchParams();
  if (params.productId) sp.set("productId", params.productId);
  if (params.q) sp.set("q", params.q);
  if (params.tipo) sp.set("tipo", params.tipo);
  if (params.fechaDesde) sp.set("fechaDesde", params.fechaDesde);
  if (params.fechaHasta) sp.set("fechaHasta", params.fechaHasta);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return apiFetch(`/api/stock-movements${qs}`);
}

export async function voidStockMovement(id: string, voidReason?: string | null) {
  return apiFetch<{ ok: boolean }>(`/api/stock-movements/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ void_reason: voidReason ?? null }),
  });
}

export async function createStockMovement(input: StockMovementInput) {
  return apiFetch("/api/stock-movements", {
    method: "POST",
    body: JSON.stringify({
      product_id: input.product_id,
      tipo: input.tipo,
      cantidad: input.cantidad,
      observacion: input.observacion,
    }),
  });
}
