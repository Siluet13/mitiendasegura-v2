import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { getTopProducts } from "@/lib/api/dashboard";

const chartConfig: ChartConfig = {
  unidades: {
    label: "Unidades vendidas",
    color: "oklch(0.32 0.16 265)",
  },
};

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export function TopProductsChart() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "top-products"],
    queryFn: getTopProducts,
    staleTime: 120_000,
  });

  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-4">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Top 10 Productos — Unidades vendidas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isError && (
          <p className="text-sm text-destructive">Error al cargar el gráfico de productos.</p>
        )}
        {isLoading && <Skeleton className="h-52 w-full" />}
        {data && (
          data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay datos de ventas disponibles.</p>
          ) : (
            <ChartContainer config={chartConfig} className="h-52 w-full">
              <BarChart
                data={data.map((p) => ({
                  nombre: truncate(p.nombre, 14),
                  unidades: p.unidades,
                }))}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="nombre"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickMargin={6}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickMargin={6}
                  allowDecimals={false}
                  width={36}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => [value, "Unidades"]}
                    />
                  }
                />
                <Bar
                  dataKey="unidades"
                  fill="oklch(0.32 0.16 265)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ChartContainer>
          )
        )}
      </CardContent>
    </Card>
  );
}
