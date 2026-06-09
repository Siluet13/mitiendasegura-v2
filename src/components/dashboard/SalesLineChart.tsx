import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { getSalesByDay } from "@/lib/api/dashboard";

const chartConfig: ChartConfig = {
  total: {
    label: "Ventas",
    color: "oklch(0.72 0.18 145)",
  },
};

function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function SalesLineChart() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "sales-by-day"],
    queryFn: getSalesByDay,
    staleTime: 60_000,
  });

  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-4">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Ventas — Últimos 7 días
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isError && (
          <p className="text-sm text-destructive">Error al cargar el gráfico de ventas.</p>
        )}
        {isLoading && <Skeleton className="h-48 w-full" />}
        {data && (
          <ChartContainer config={chartConfig} className="h-48 w-full">
            <AreaChart
              data={data.map((d) => ({ ...d, fecha: formatShortDate(d.fecha) }))}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="fecha"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  new Intl.NumberFormat("es-AR", {
                    notation: "compact",
                    maximumFractionDigits: 0,
                  }).format(v)
                }
                width={56}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => [formatCurrency(Number(value)), "Ventas"]}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="oklch(0.72 0.18 145)"
                strokeWidth={2}
                fill="url(#salesGradient)"
                dot={{ r: 3, fill: "oklch(0.72 0.18 145)" }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
