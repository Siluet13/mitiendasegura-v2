import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Category = Tables<"categories">;
export type Product = Tables<"products"> & { categories?: { nombre: string } | null };

// ---------------- Categories ----------------
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(input: { nombre: string }) {
  const payload: TablesInsert<"categories"> = { nombre: input.nombre } as TablesInsert<"categories">;
  const { data, error } = await supabase.from("categories").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, input: { nombre: string }) {
  const payload: TablesUpdate<"categories"> = { nombre: input.nombre };
  const { data, error } = await supabase.from("categories").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Products ----------------
export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*, categories(nombre)")
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Product[];
}

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

export async function createProduct(input: ProductInput) {
  const payload = { ...input } as TablesInsert<"products">;
  const { data, error } = await supabase.from("products").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id: string, input: ProductInput) {
  const payload = { ...input } as TablesUpdate<"products">;
  const { data, error } = await supabase.from("products").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Stock movements ----------------
export type StockMovement = Tables<"stock_movements"> & {
  products?: { nombre: string; sku: string | null } | null;
};

export type StockMovementInput = {
  product_id: string;
  tipo: "entrada" | "salida";
  cantidad: number;
  observacion?: string | null;
};

export async function listStockMovements(params: { productId?: string | null } = {}): Promise<StockMovement[]> {
  let q = supabase
    .from("stock_movements")
    .select("*, products(nombre, sku)")
    .order("created_at", { ascending: false });
  if (params.productId) q = q.eq("product_id", params.productId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as StockMovement[];
}

// ---------------- Customers ----------------
export type Customer = Tables<"customers">;

export type CustomerInput = {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  observaciones?: string | null;
};

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const payload: TablesInsert<"customers"> = {
    nombre: input.nombre,
    telefono: input.telefono ?? null,
    email: input.email ?? null,
    direccion: input.direccion ?? null,
    observaciones: input.observaciones ?? null,
  } as TablesInsert<"customers">;
  const { data, error } = await supabase.from("customers").insert(payload).select().single();
  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  const payload: TablesUpdate<"customers"> = {
    nombre: input.nombre,
    telefono: input.telefono ?? null,
    email: input.email ?? null,
    direccion: input.direccion ?? null,
    observaciones: input.observaciones ?? null,
  };
  const { data, error } = await supabase.from("customers").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data as Customer;
}

export async function deleteCustomer(id: string) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Sales ----------------
export type Sale = Tables<"sales">;
export type SaleItem = Tables<"sale_items"> & {
  products?: { nombre: string; sku: string | null } | null;
};
export type SaleWithItems = Sale & { sale_items: SaleItem[] };

export type SaleItemInput = { product_id: string; cantidad: number };

export async function listSales(): Promise<Sale[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSaleWithItems(id: string): Promise<SaleWithItems | null> {
  const { data, error } = await supabase
    .from("sales")
    .select("*, sale_items(*, products(nombre, sku))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as SaleWithItems | null) ?? null;
}

export async function createSale(input: {
  items: SaleItemInput[];
  observacion?: string | null;
  customer_id?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_sale", {
    p_items: input.items as unknown as never,
    p_observacion: input.observacion ?? undefined,
    p_customer_id: input.customer_id ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function createStockMovement(input: StockMovementInput) {
  const payload = {
    product_id: input.product_id,
    tipo: input.tipo,
    cantidad: input.cantidad,
    observacion: input.observacion ?? null,
  } as TablesInsert<"stock_movements">;
  const { data, error } = await supabase.from("stock_movements").insert(payload).select().single();
  if (error) throw error;
  return data;
}
