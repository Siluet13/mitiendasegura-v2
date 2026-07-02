import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, ChevronDown, LogOut, RefreshCw, CreditCard, Code2 } from "lucide-react";
import { toast } from "sonner";
import { listBusinesses, updateLicense, registerPayment } from "@/lib/api/admin";
import type { BusinessRow } from "@/lib/api/admin";
import type { LicenseStatus } from "@/hooks/useLicense";
import { getBillingStatus } from "@shared/billing";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { BusinessDetailSheet } from "@/components/admin/BusinessDetailSheet";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Panel Maestro" }] }),
  component: AdminIndex,
});

type FilterMode = LicenseStatus | "proximos" | "";

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

function fmt(date: string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("es-AR");
}

function daysLeftForRow(b: BusinessRow): number | null {
  if (!b.billingCycleEnd) return null;
  const billing = getBillingStatus({
    billing_cycle_start: b.billingCycleStart,
    billing_cycle_end: b.billingCycleEnd,
    last_payment_date: b.lastPaymentDate,
  });
  return billing.daysLeft;
}

function DaysLeftCell({ b }: { b: BusinessRow }) {
  const days = daysLeftForRow(b);
  if (days === null) return <span className="text-muted-foreground">—</span>;
  if (days <= 0) return <span className="font-medium text-destructive">Vencido</span>;
  if (days <= 5) return <span className="font-medium text-yellow-600">{days}d</span>;
  return <span>{days}d</span>;
}

function AdminIndex() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("");
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  const { data: businesses = [], isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/businesses"],
    queryFn: listBusinesses,
    staleTime: 0,
  });

  const licenseMut = useMutation({
    mutationFn: ({ ownerId, status }: { ownerId: string; status: LicenseStatus }) =>
      updateLicense(ownerId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast.success("Licencia actualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paymentMut = useMutation({
    mutationFn: (ownerId: string) => registerPayment(ownerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast.success("Pago registrado — ciclo renovado 30 días");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isPending = licenseMut.isPending || paymentMut.isPending;

  const proximos = businesses.filter((b) => {
    const d = daysLeftForRow(b);
    return d !== null && d > 0 && d <= 5 && b.licenseStatus === "activa";
  });

  const filtered = businesses.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (b.email ?? "").toLowerCase().includes(q) ||
      (b.nombreNegocio ?? "").toLowerCase().includes(q);

    let matchFilter = true;
    if (filterMode === "proximos") {
      const d = daysLeftForRow(b);
      matchFilter = d !== null && d > 0 && d <= 5 && b.licenseStatus === "activa";
    } else if (filterMode) {
      matchFilter = b.licenseStatus === filterMode;
    }

    return matchSearch && matchFilter;
  });

  function filterLabel(f: FilterMode): string {
    if (f === "proximos") return "Próximos a vencer";
    if (f === "") return "Todos los estados";
    return statusLabel(f);
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
            <Button variant="outline" size="sm" asChild>
              <a href="/admin/offline-debug">Diagnóstico Offline</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/admin/dev">
                <Code2 className="h-4 w-4 mr-1" /> Panel Dev
              </a>
            </Button>
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

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {(["activa", "pendiente", "suspendida", "vencida"] as LicenseStatus[]).map((s) => (
            <Card
              key={s}
              className={`cursor-pointer hover:border-primary/50 transition-colors ${filterMode === s ? "border-primary" : ""}`}
              onClick={() => setFilterMode(filterMode === s ? "" : s)}
            >
              <CardContent className="pt-4 pb-4">
                <div className="text-2xl font-bold">
                  {businesses.filter((b) => b.licenseStatus === s).length}
                </div>
                <div className="text-sm text-muted-foreground capitalize">{statusLabel(s)}</div>
              </CardContent>
            </Card>
          ))}
          <Card
            className={`cursor-pointer hover:border-yellow-400 transition-colors ${filterMode === "proximos" ? "border-yellow-400" : ""}`}
            onClick={() => setFilterMode(filterMode === "proximos" ? "" : "proximos")}
          >
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-yellow-600">{proximos.length}</div>
              <div className="text-sm text-muted-foreground">Próx. a vencer</div>
            </CardContent>
          </Card>
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
                    {filterLabel(filterMode)}
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setFilterMode("")}>Todos</DropdownMenuItem>
                  {(["activa", "pendiente", "suspendida", "vencida"] as LicenseStatus[]).map((s) => (
                    <DropdownMenuItem key={s} onClick={() => setFilterMode(s)}>
                      {statusLabel(s)}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFilterMode("proximos")}>
                    Próximos a vencer (≤5 días)
                  </DropdownMenuItem>
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
                      <TableHead>Vencimiento</TableHead>
                      <TableHead className="text-right">Días rest.</TableHead>
                      <TableHead>Último pago</TableHead>
                      <TableHead>Alta</TableHead>
                      <TableHead className="text-right">Prod.</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Clientes</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((b) => (
                      <TableRow
                        key={b.ownerId}
                        className="cursor-pointer hover:bg-muted/60"
                        onClick={() => setSelectedOwnerId(b.ownerId)}
                      >
                        <TableCell>
                          <div className="font-medium text-sm">{b.email ?? b.ownerId}</div>
                          {b.nombreNegocio && (
                            <div className="text-xs text-muted-foreground">{b.nombreNegocio}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={b.licenseStatus} />
                        </TableCell>
                        <TableCell className="text-sm">{fmt(b.billingCycleEnd)}</TableCell>
                        <TableCell className="text-right text-sm">
                          <DaysLeftCell b={b} />
                        </TableCell>
                        <TableCell className="text-sm">{fmt(b.lastPaymentDate)}</TableCell>
                        <TableCell className="text-sm">{fmt(b.registeredAt)}</TableCell>
                        <TableCell className="text-right text-sm">{b.productCount}</TableCell>
                        <TableCell className="text-right text-sm">{b.saleCount}</TableCell>
                        <TableCell className="text-right text-sm">{b.customerCount}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" disabled={isPending}>
                                Acción <ChevronDown className="h-3 w-3 ml-1" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setSelectedOwnerId(b.ownerId)}
                              >
                                Ver ficha
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => paymentMut.mutate(b.ownerId)}
                                className="gap-2"
                              >
                                <CreditCard className="h-3.5 w-3.5" />
                                Registrar pago
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {b.licenseStatus !== "activa" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    licenseMut.mutate({ ownerId: b.ownerId, status: "activa" })
                                  }
                                >
                                  Activar
                                </DropdownMenuItem>
                              )}
                              {(b.licenseStatus === "suspendida" || b.licenseStatus === "vencida") && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    licenseMut.mutate({ ownerId: b.ownerId, status: "activa" })
                                  }
                                >
                                  Reactivar
                                </DropdownMenuItem>
                              )}
                              {b.licenseStatus === "activa" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    licenseMut.mutate({ ownerId: b.ownerId, status: "suspendida" })
                                  }
                                  className="text-destructive focus:text-destructive"
                                >
                                  Suspender
                                </DropdownMenuItem>
                              )}
                              {b.licenseStatus === "activa" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    licenseMut.mutate({ ownerId: b.ownerId, status: "vencida" })
                                  }
                                  className="text-destructive focus:text-destructive"
                                >
                                  Marcar vencida
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BusinessDetailSheet
        ownerId={selectedOwnerId}
        onClose={() => setSelectedOwnerId(null)}
      />
    </div>
  );
}
