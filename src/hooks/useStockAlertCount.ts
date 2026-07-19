import { useQuery } from "@tanstack/react-query";
import { getStockAlerts } from "@/lib/api/stockAlerts";

/**
 * Devuelve el total de alertas de stock activas para el sidebar badge.
 * Se refresca automáticamente vía SSE cuando hay cambios de stock.
 */
export function useStockAlertCount(): number {
  const { data } = useQuery({
    queryKey: ["stock_alerts"],
    queryFn: getStockAlerts,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return data?.total ?? 0;
}
