import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getAdminMe, listBusinesses, updateLicense } from "@/lib/api/admin";
import type { BusinessRow } from "@/lib/api/admin";
import type { LicenseStatus } from "@/hooks/useLicense";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Building2, ChevronDown, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Panel Maestro" }] }),
  component: AdminPage,
});

function statusLabel(s: LicenseStatus) {
  const map: Record<LicenseStatus, string> = {
    activa: "Activa",
    pendiente: "Pendiente",
    suspendida: "Suspendida",
    vencida: "Vencida",
  };
  return map[s];
}

function StatusBadge({ status }: { status: LicenseStatus }) {
  const variants: Record<LicenseStatus, "default" | "secondary" | "destructive" | "outline"> = {
    activa: "default",
    pendiente: "outline",
    suspendida: "destructive",
    vencida: "secondary",
  };
  return <Badge variant={variants[status]}>{statusLabel(status)}</Badge>;
}

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("es-AR");
}

function AdminPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<LicenseStatus | "">("");

  const { data: businesses = [], isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/businesses"],
    queryFn: listBusinesses,
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: ({ ownerId, status }: { ownerId: string; status: LicenseStatus }) =>
      updateLicense(ownerId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast.success("Licencia actualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = businesses.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (b.email ?? "").toLowerCase().includes(q) ||
      (b.nombreNegocio ?? "").toLowerCase().includes(q);
    const matchStatus = !filterStatus || b.licenseStatus === filterStatus;
    return matchSearch && matchStatus;
  });

  function actions(b: BusinessRow) {
    const opts: { label: string; status: LicenseStatus }[] = [];
    if (b.licenseStatus !== "activa") opts.push({ label: "Activar", status: "activa" });
    if (b.licenseStatus === "activa") opts.push({ label: "Suspender", status: "suspendida" });
    if (b.licenseStatus === "activa") opts.push({ label: "Marcar vencida", status: "vencida" });
    if (b.licenseStatus === "suspendida" || b.licenseStatus === "vencida")
      opts.push({ label: "Reactivar", status: "activa" });
    return opts;
  }

  return (
    <div className="min-h-screen bg-muted/40 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Panel Maestro</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/logout">
                <LogOut className="h-4 w-4 mr-1" /> Salir
              </a>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(["", "activa", "pendiente", "suspendida", "vencida"] as const).slice(1).map((s) => (
            <Card
              key={s}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
            >
              <CardContent className="pt-4 pb-4">
                <div className="text-2xl font-bold">
                  {businesses.filter((b) => b.licenseStatus === s).length}
                </div>
                <div className="text-sm text-muted-foreground capitalize">{statusLabel(s)}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Negocios registrados ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Buscar por email o nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {filterStatus ? statusLabel(filterStatus) : "Todos los estados"}
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setFilterStatus("")}>Todos</DropdownMenuItem>
                  {(["activa", "pendiente", "suspendida", "vencida"] as LicenseStatus[]).map((s) => (
                    <DropdownMenuItem key={s} onClick={() => setFilterStatus(s)}>
                      {statusLabel(s)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No hay negocios que coincidan con los filtros
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email / Negocio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Alta</TableHead>
                      <TableHead className="text-right">Productos</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Clientes</TableHead>
                      <TableHead>Últ. venta</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((b) => {
                      const opts = actions(b);
                      return (
                        <TableRow key={b.ownerId}>
                          <TableCell>
                            <div className="font-medium text-sm">{b.email ?? b.ownerId}</div>
                            {b.nombreNegocio && (
                              <div className="text-xs text-muted-foreground">{b.nombreNegocio}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={b.licenseStatus} />
                          </TableCell>
                          <TableCell className="text-sm">{fmt(b.registeredAt)}</TableCell>
                          <TableCell className="text-right text-sm">{b.productCount}</TableCell>
                          <TableCell className="text-right text-sm">{b.saleCount}</TableCell>
                          <TableCell className="text-right text-sm">{b.customerCount}</TableCell>
                          <TableCell className="text-sm">{fmt(b.lastSaleAt)}</TableCell>
                          <TableCell>
                            {opts.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={mutation.isPending}
                                  >
                                    Acción <ChevronDown className="h-3 w-3 ml-1" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {opts.map((o) => (
                                    <DropdownMenuItem
                                      key={o.status}
                                      onClick={() =>
                                        mutation.mutate({ ownerId: b.ownerId, status: o.status })
                                      }
                                    >
                                      {o.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminPage() {
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

  return <AdminPanel />;
}
