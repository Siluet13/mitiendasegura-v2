import { useQuery } from "@tanstack/react-query";
import { DollarSign, Package, ShoppingCart, Users, Banknote, ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardKpis } from "@/lib/api/dashboard";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return formatCurrency(value);
}

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  description?: string;
  subItems?: { label: string; value: string }[];
}

function KpiCard({ title, value, icon, description, subItems }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-primary">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {subItems && subItems.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {subItems.map((item) => (
              <div key={item.label} className="flex justify-between text-xs text-muted-foreground">
                <span>{item.label}</span>
                <span className="tabular-nums font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-5 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-3 w-32 mt-2" />
        <Skeleton className="h-3 w-28 mt-1" />
      </CardContent>
    </Card>
  );
}

export function KpiCards() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: getDashboardKpis,
    staleTime: 60_000,
  });

  if (isError) {
    return (
      <div className="col-span-4 text-sm text-destructive text-center py-4">
        Error al cargar indicadores.
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <>
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </>
    );
  }

  // Desglose de hoy — solo mostrar filas con valor > 0
  const todaySubItems = [
    data.cashToday     > 0 && { label: "Efectivo",       value: formatCurrency(data.cashToday) },
    data.transferToday > 0 && { label: "Transferencia",  value: formatCurrency(data.transferToday) },
    data.accountToday  > 0 && { label: "Cta. corriente", value: formatCurrency(data.accountToday) },
  ].filter(Boolean) as { label: string; value: string }[];

  // Desglose del mes
  const monthSubItems = [
    data.cashMonth     > 0 && { label: "Efectivo",       value: formatCompact(data.cashMonth) },
    data.transferMonth > 0 && { label: "Transferencia",  value: formatCompact(data.transferMonth) },
    data.accountMonth  > 0 && { label: "Cta. corriente", value: formatCompact(data.accountMonth) },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <>
      <KpiCard
        title="Ventas de hoy"
        value={formatCurrency(data.collectedToday)}
        icon={<ShoppingCart className="h-4 w-4" />}
        description={
          data.salesCountToday > 0
            ? `${data.salesCountToday} venta${data.salesCountToday !== 1 ? "s" : ""} · total facturado ${formatCurrency(data.salesToday)}`
            : "Sin ventas hoy"
        }
        subItems={todaySubItems}
      />
      <KpiCard
        title="Ventas del mes"
        value={formatCurrency(data.collectedMonth)}
        icon={<DollarSign className="h-4 w-4" />}
        description={
          data.salesCountMonth > 0
            ? `${data.salesCountMonth} ventas · total facturado ${formatCompact(data.salesMonth)}`
            : "Sin ventas este mes"
        }
        subItems={monthSubItems}
      />
      <KpiCard
        title="Productos activos"
        value={data.activeProducts.toString()}
        icon={<Package className="h-4 w-4" />}
        description="Productos habilitados en catálogo"
      />
      <KpiCard
        title="Clientes registrados"
        value={data.totalCustomers.toString()}
        icon={<Users className="h-4 w-4" />}
        description="Total de clientes en el sistema"
      />
    </>
  );
}
