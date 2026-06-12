async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  return res.json();
}

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

export async function getDashboardKpis(): Promise<DashboardKpis> {
  return apiFetch("/api/dashboard/kpis");
}

export async function getStockAlerts(): Promise<StockAlerts> {
  return apiFetch("/api/dashboard/stock-alerts");
}

export async function getTopProducts(): Promise<TopProduct[]> {
  return apiFetch("/api/dashboard/top-products");
}

export async function getRecentSales(): Promise<RecentSale[]> {
  return apiFetch("/api/dashboard/recent-sales");
}

export async function getSalesByDay(): Promise<SalesByDay[]> {
  return apiFetch("/api/dashboard/sales-by-day");
}
