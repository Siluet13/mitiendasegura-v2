import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DashboardKpis {
  salesToday: number;
  salesMonth: number;
  activeProducts: number;
  totalCustomers: number;
}

export interface StockAlert {
  id: string;
  nombre: string;
  stock: number;
}

export interface StockAlerts {
  sinStock: StockAlert[];
  stockBajo: StockAlert[];
}

export interface TopProduct {
  product_id: string;
  nombre: string;
  unidades: number;
  importe: number;
}

export interface RecentSale {
  id: string;
  created_at: string;
  total: number;
  cliente: string | null;
  cantidad_productos: number;
}

export interface SalesByDay {
  fecha: string;
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const { start, end } = todayRange();
  const mStart = monthStart();

  const [todayRes, monthRes, productsRes, customersRes] = await Promise.all([
    supabase
      .from("sales")
      .select("total")
      .gte("created_at", start)
      .lt("created_at", end),
    supabase
      .from("sales")
      .select("total")
      .gte("created_at", mStart),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("activo", true),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true }),
  ]);

  if (todayRes.error) throw todayRes.error;
  if (monthRes.error) throw monthRes.error;
  if (productsRes.error) throw productsRes.error;
  if (customersRes.error) throw customersRes.error;

  const salesToday = (todayRes.data ?? []).reduce((sum, s) => sum + (s.total ?? 0), 0);
  const salesMonth = (monthRes.data ?? []).reduce((sum, s) => sum + (s.total ?? 0), 0);

  return {
    salesToday,
    salesMonth,
    activeProducts: productsRes.count ?? 0,
    totalCustomers: customersRes.count ?? 0,
  };
}

export async function getStockAlerts(): Promise<StockAlerts> {
  const { data, error } = await supabase
    .from("products")
    .select("id, nombre, stock")
    .eq("activo", true)
    .lte("stock", 5)
    .order("stock", { ascending: true });

  if (error) throw error;

  const rows = data ?? [];
  return {
    sinStock: rows.filter((p) => p.stock === 0),
    stockBajo: rows.filter((p) => p.stock > 0 && p.stock <= 5),
  };
}

export async function getTopProducts(): Promise<TopProduct[]> {
  const { data, error } = await supabase
    .from("sale_items")
    .select("product_id, cantidad, subtotal, products(nombre)");

  if (error) throw error;

  const map = new Map<string, TopProduct>();

  for (const item of data ?? []) {
    if (!item.product_id) continue;
    const nombre =
      item.products && "nombre" in item.products
        ? (item.products as { nombre: string }).nombre
        : "Producto eliminado";
    const existing = map.get(item.product_id);
    if (existing) {
      existing.unidades += item.cantidad ?? 0;
      existing.importe += item.subtotal ?? 0;
    } else {
      map.set(item.product_id, {
        product_id: item.product_id,
        nombre,
        unidades: item.cantidad ?? 0,
        importe: item.subtotal ?? 0,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 10);
}

export async function getRecentSales(): Promise<RecentSale[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("id, created_at, total, customers(nombre), sale_items(id)")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  return (data ?? []).map((s) => ({
    id: s.id,
    created_at: s.created_at,
    total: s.total ?? 0,
    cliente:
      s.customers && "nombre" in s.customers
        ? (s.customers as { nombre: string }).nombre
        : null,
    cantidad_productos: Array.isArray(s.sale_items) ? s.sale_items.length : 0,
  }));
}

export async function getSalesByDay(): Promise<SalesByDay[]> {
  const since = daysAgoISO(6);

  const { data, error } = await supabase
    .from("sales")
    .select("created_at, total")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const map = new Map<string, number>();

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, 0);
  }

  for (const s of data ?? []) {
    const key = s.created_at.slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + (s.total ?? 0));
  }

  return Array.from(map.entries()).map(([fecha, total]) => ({ fecha, total }));
}
