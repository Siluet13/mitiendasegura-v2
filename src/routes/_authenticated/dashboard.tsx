import { createFileRoute } from "@tanstack/react-router";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { StockAlerts } from "@/components/dashboard/StockAlerts";
import { TopProductsTable } from "@/components/dashboard/TopProductsTable";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { SalesLineChart } from "@/components/dashboard/SalesLineChart";
import { TopProductsChart } from "@/components/dashboard/TopProductsChart";

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

      {/* Stock alerts + Top products table */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StockAlerts />
        <TopProductsTable />
      </div>

      {/* Top products bar chart — full width */}
      <div className="grid grid-cols-1 gap-4">
        <TopProductsChart />
      </div>

      {/* Recent sales — full width */}
      <div className="grid grid-cols-1 gap-4">
        <RecentSales />
      </div>
    </div>
  );
}
