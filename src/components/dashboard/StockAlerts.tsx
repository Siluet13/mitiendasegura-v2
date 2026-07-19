import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getStockAlerts } from "@/lib/api/stockAlerts";

export function StockAlerts() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stock_alerts"],
    queryFn: getStockAlerts,
    staleTime: 60_000,
  });

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Alertas de Stock
        </CardTitle>
        <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground gap-1 h-7 px-2">
          <Link to="/stock-alerts">
            Ver todas
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isError && (
          <p className="text-sm text-destructive">Error al cargar alertas de stock.</p>
        )}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-semibold">Sin stock</span>
                <Badge variant="destructive" className="ml-auto text-xs">
                  {data.sinStock.length}
                </Badge>
              </div>
              {data.sinStock.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin productos agotados</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {data.sinStock.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded-md px-2 py-1 bg-destructive/5 text-sm"
                    >
                      <span className="truncate flex-1 mr-2">{p.nombre}</span>
                      <Badge variant="destructive" className="text-xs shrink-0">
                        0
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold">Stock bajo</span>
                <Badge
                  className="ml-auto text-xs bg-amber-100 text-amber-800 hover:bg-amber-100"
                >
                  {data.stockBajo.length}
                </Badge>
              </div>
              {data.stockBajo.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin productos con stock bajo</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {data.stockBajo.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded-md px-2 py-1 bg-amber-50 text-sm"
                    >
                      <span className="truncate flex-1 mr-2">{p.nombre}</span>
                      <Badge className="text-xs shrink-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
                        {p.stock}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
