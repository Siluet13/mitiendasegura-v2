import { createFileRoute } from "@tanstack/react-router";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { StockAlerts } from "@/components/dashboard/StockAlerts";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { SalesLineChart } from "@/components/dashboard/SalesLineChart";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard Ejecutivo" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard Ejecutivo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Resumen general del negocio en tiempo real
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCards />
      </div>

      {/* Sales chart — full width */}
      <div className="grid grid-cols-1 gap-4">
        <SalesLineChart />
      </div>

      {/* Stock alerts — full width */}
      <div className="grid grid-cols-1 gap-4">
        <StockAlerts />
      </div>

      {/* Recent sales — full width */}
      <div className="grid grid-cols-1 gap-4">
        <RecentSales />
      </div>
    </div>
  );
}
