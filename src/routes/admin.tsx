import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getAdminMe } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { user, loading } = useAuth();

  const { data: adminData, isLoading: adminLoading } = useQuery({
    queryKey: ["/api/admin/me"],
    queryFn: getAdminMe,
    enabled: !!user,
    retry: false,
  });

  if (loading || adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Verificando acceso...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!adminData?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-semibold">Acceso denegado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No tenés permisos para acceder a este panel.
          </p>
          <Button className="mt-4" asChild>
            <a href="/dashboard">Ir al inicio</a>
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
