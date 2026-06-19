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
};

export type Sale = {
  id: string;
  ownerId: string;
  userId: string;
  customerId: string | null;
  total: string | number;
  observacion: string | null;
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
};

export type StockMovementInput = {
  product_id: string;
  tipo: "entrada" | "salida";
  cantidad: number;
  observacion?: string | null;
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timerId = setTimeout(
    () => controller.abort(new DOMException("Timeout", "TimeoutError")),
    8000,
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
  return apiFetch("/api/categories", { method: "POST", body: JSON.stringify(input) });
}

export async function updateCategory(id: string, input: { nombre: string }) {
  return apiFetch(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export async function deleteCategory(id: string) {
  return apiFetch(`/api/categories/${id}`, { method: "DELETE" });
}

// ── Products ──────────────────────────────────────────────────────────────────
export async function listProducts(): Promise<Product[]> {
  return apiFetch("/api/products");
}

export async function createProduct(input: ProductInput) {
  return apiFetch("/api/products", { method: "POST", body: JSON.stringify(input) });
}

export async function updateProduct(id: string, input: ProductInput) {
  return apiFetch(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(input) });
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
  return apiFetch("/api/customers", { method: "POST", body: JSON.stringify(input) });
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  return apiFetch(`/api/customers/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export async function deleteCustomer(id: string) {
  return apiFetch(`/api/customers/${id}`, { method: "DELETE" });
}

// ── Sales ─────────────────────────────────────────────────────────────────────
export async function listSales(): Promise<Sale[]> {
  return apiFetch("/api/sales");
}

export async function getSaleWithItems(id: string): Promise<SaleWithItems | null> {
  return apiFetch(`/api/sales/${id}`);
}

export async function createSale(input: {
  items: SaleItemInput[];
  observacion?: string | null;
  customer_id?: string | null;
  client_id?: string | null;
}) {
  const data = await apiFetch<{ id: string }>("/api/sales", {
    method: "POST",
    body: JSON.stringify({
      items: input.items,
      observacion: input.observacion,
      customer_id: input.customer_id,
      client_id: input.client_id ?? null,
    }),
  });
  return data.id;
}

// ── Stock Movements ───────────────────────────────────────────────────────────
export async function listStockMovements(params: { productId?: string | null } = {}): Promise<StockMovement[]> {
  const qs = params.productId ? `?productId=${params.productId}` : "";
  return apiFetch(`/api/stock-movements${qs}`);
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
