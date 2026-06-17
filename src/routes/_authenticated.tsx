import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useLicense } from "@/hooks/useLicense";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTenantEvents } from "@/hooks/useTenantEvents";
import { Button } from "@/components/ui/button";
import { ShieldX, WifiOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const licenseMessages: Record<string, string> = {
  pendiente: "Tu cuenta está pendiente de activación. Contactá al administrador para activar tu licencia.",
  suspendida: "Tu cuenta fue suspendida. Contactá al administrador para más información.",
  vencida: "Tu licencia venció. Contactá al administrador para renovarla.",
};

function LicenseBlock({ status }: { status: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center max-w-sm space-y-4">
        <ShieldX className="h-12 w-12 mx-auto text-destructive" />
        <h1 className="text-xl font-semibold">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          {licenseMessages[status] ?? "Tu cuenta no está habilitada."}
        </p>
        <Button variant="outline" asChild>
          <a href="/api/logout">Cerrar sesión</a>
        </Button>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const { license, licenseLoading } = useLicense();
  const isOnline = useOnlineStatus();
  useTenantEvents();

  if (loading || (user && licenseLoading)) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Cargando...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  if (license && license.status !== "activa") {
    return <LicenseBlock status={license.status} />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-12 items-center border-b px-2 gap-2">
            <SidebarTrigger />
            {!isOnline && (
              <span className="ml-auto flex items-center gap-1.5 pr-4 text-sm text-muted-foreground">
                <WifiOff className="h-4 w-4" />
                Sin conexión
              </span>
            )}
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
