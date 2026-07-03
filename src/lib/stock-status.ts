export type StockStatus = "green" | "yellow" | "red";

/**
 * Calcula el estado de stock de un producto.
 *
 * VERDE  → stock > stock_min
 * AMARILLO → stock <= stock_min AND stock > 0
 * ROJO   → stock === 0
 */
export function getStockStatus(stock: number, minStock: number): StockStatus {
  if (stock === 0) return "red";
  if (stock <= minStock) return "yellow";
  return "green";
}

/**
 * Devuelve la clase CSS correspondiente al estado de stock.
 * Diseñado para usar directamente en className de un <span>.
 */
export function getStockStatusClass(status: StockStatus): string {
  switch (status) {
    case "red":    return "text-destructive font-semibold";
    case "yellow": return "text-amber-600 font-semibold";
    case "green":  return "text-emerald-600";
  }
}
