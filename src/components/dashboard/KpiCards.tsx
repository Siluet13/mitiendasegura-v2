import { useQuery } from "@tanstack/react-query";
import { DollarSign, Package, ShoppingCart, Users } from "lucide-react";
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

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  description?: string;
}

function KpiCard({ title, value, icon, description }: KpiCardProps) {
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

  return (
    <>
      <KpiCard
        title="Ventas de hoy"
        value={formatCurrency(data.salesToday)}
        icon={<ShoppingCart className="h-4 w-4" />}
        description="Total facturado hoy"
      />
      <KpiCard
        title="Ventas del mes"
        value={formatCurrency(data.salesMonth)}
        icon={<DollarSign className="h-4 w-4" />}
        description="Acumulado del mes en curso"
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
