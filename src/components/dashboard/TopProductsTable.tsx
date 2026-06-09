import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getTopProducts } from "@/lib/api/dashboard";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function TopProductsTable() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "top-products"],
    queryFn: getTopProducts,
    staleTime: 120_000,
  });

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          Top 10 Productos más vendidos
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isError && (
          <p className="text-sm text-destructive p-4">Error al cargar productos más vendidos.</p>
        )}
        {isLoading && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {data && (
          data.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No hay ventas registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-8">#</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Producto</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Unidades</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p, idx) => (
                    <tr key={p.product_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-medium">{p.nombre}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{p.unidades}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-primary font-medium">
                        {formatCurrency(p.importe)}
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
