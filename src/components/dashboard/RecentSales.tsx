import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecentSales } from "@/lib/api/dashboard";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentSales() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "recent-sales"],
    queryFn: getRecentSales,
    staleTime: 60_000,
  });

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Actividad reciente — Últimas 10 ventas
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isError && (
          <p className="text-sm text-destructive p-4">Error al cargar ventas recientes.</p>
        )}
        {isLoading && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        {data && (
          data.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No hay ventas registradas aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Productos</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {formatDate(s.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.cliente ? (
                          <span>{s.cliente}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Consumidor final</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Badge variant="secondary" className="text-xs">
                          {s.cantidad_productos} {s.cantidad_productos === 1 ? "ítem" : "ítems"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-primary">
                        {formatCurrency(s.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
