import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBusinesses, getBusinessDetail, getDevStats } from "@/lib/api/admin";
import type { BusinessRow, BusinessDetail, DevStats } from "@/lib/api/admin";
import { getBillingStatus } from "@shared/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Download, RefreshCw, ArrowLeft, Server, Wifi, Building2, Users, Package, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/admin/dev")({
  head: () => ({ meta: [{ title: "Panel Dev" }] }),
  component: DevPage,
});

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function useEventSourceStatus(): "connected" | "connecting" | "disconnected" {
  const [status, setStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    function connect() {
      if (!active) return;
      setStatus("connecting");
      es = new EventSource("/api/events");
      es.onopen = () => setStatus("connected");
      es.onmessage = () => setStatus("connected");
      es.onerror = () => {
        es?.close();
        es = null;
        if (active) {
          setStatus("disconnected");
          timer = setTimeout(connect, 15_000);
        }
      };
    }

    connect();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, []);
  return status;
}

function useSwStatus(): boolean | null {
  const [active, setActive] = useState<boolean | null>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => setActive(!!reg?.active))
        .catch(() => setActive(false));
    } else {
      setActive(false);
    }
  }, []);
  return active;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("es-AR");
}

function StatusRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: number | null | undefined;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-2xl font-bold">
          {loading ? (
            <span className="text-muted-foreground text-lg">…</span>
          ) : value != null ? (
            value.toLocaleString("es-AR")
          ) : (
            "—"
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const LICENSE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  activa: "default",
  pendiente: "outline",
  suspendida: "destructive",
  vencida: "secondary",
};

const LICENSE_LABELS: Record<string, string> = {
  activa: "Activa",
  pendiente: "Pendiente",
  suspendida: "Suspendida",
  vencida: "Vencida",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 items-start py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs break-all">{value ?? "—"}</span>
    </div>
  );
}

function BusinessInspector({ ownerId }: { ownerId: string }) {
  const [tab] = useState<"info">("info");

  const { data: detail, isLoading } = useQuery<BusinessDetail>({
    queryKey: ["/api/admin/businesses", ownerId],
    queryFn: () => getBusinessDetail(ownerId),
    staleTime: 60_000,
  });

  const billingDays = detail?.billingCycleEnd
    ? getBillingStatus({
        billing_cycle_end: detail.billingCycleEnd,
        billing_cycle_start: detail.billingCycleStart,
        last_payment_date: detail.lastPaymentDate,
      }).daysLeft
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-destructive">
        Error al cargar
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <p className="font-medium text-sm">{detail.nombreNegocio ?? detail.email ?? ownerId}</p>
        <p className="text-xs text-muted-foreground">{detail.email}</p>
      </div>

      <div className="flex border-b mb-4">
        <button
          className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
            tab === "info"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground"
          }`}
        >
          Información
        </button>
        <button
          disabled
          className="px-3 py-1.5 text-xs font-medium border-b-2 -mb-px border-transparent text-muted-foreground opacity-40 cursor-not-allowed"
          title="Disponible en Fase 2"
        >
          Logs (Fase 2)
        </button>
      </div>

      <div className="space-y-0.5">
        <DetailRow
          label="Owner ID"
          value={
            <span className="font-mono text-[10px] text-muted-foreground">{detail.ownerId}</span>
          }
        />
        <DetailRow
          label="Tenant ID"
          value={
            detail.tenantId ? (
              <span className="font-mono text-[10px] text-muted-foreground">{detail.tenantId}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
        />
        <DetailRow
          label="Estado licencia"
          value={
            <Badge
              variant={LICENSE_VARIANTS[detail.licenseStatus] ?? "outline"}
              className="text-[10px] h-4 px-1.5"
            >
              {LICENSE_LABELS[detail.licenseStatus] ?? detail.licenseStatus}
            </Badge>
          }
        />
        <DetailRow
          label="Estado billing"
          value={
            billingDays === null ? (
              "—"
            ) : billingDays <= 0 ? (
              <span className="text-destructive font-medium">Vencido</span>
            ) : billingDays <= 5 ? (
              <span className="text-yellow-600 font-medium">{billingDays}d restantes</span>
            ) : (
              <span className="text-green-600">{billingDays}d restantes</span>
            )
          }
        />

        <Separator className="my-2" />

        <DetailRow label="Fecha de alta" value={fmt(detail.registeredAt)} />
        <DetailRow label="Último pago" value={fmt(detail.lastPaymentDate)} />
        <DetailRow label="Vencimiento" value={fmt(detail.billingCycleEnd)} />

        <Separator className="my-2" />

        <DetailRow label="Última sincronización" value={<span className="text-muted-foreground">— (Fase 2)</span>} />
        <DetailRow label="Último backup" value={<span className="text-muted-foreground">— (Fase 2)</span>} />
      </div>
    </div>
  );
}

function DevPage() {
  const online = useOnlineStatus();
  const sseStatus = useEventSourceStatus();
  const swActive = useSwStatus();
  const [now, setNow] = useState(new Date());
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [bizSearch, setBizSearch] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  const { data: serverHealth } = useQuery<{ status: string }>({
    queryKey: ["/health"],
    queryFn: () => fetch("/health").then((r) => r.json()),
    staleTime: 30_000,
    retry: false,
  });

  const {
    data: devStats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery<DevStats>({
    queryKey: ["/api/admin/dev/stats"],
    queryFn: getDevStats,
    staleTime: 60_000,
  });

  const {
    data: businesses = [],
    isLoading: bizLoading,
    refetch: refetchBiz,
  } = useQuery<BusinessRow[]>({
    queryKey: ["/api/admin/businesses"],
    queryFn: listBusinesses,
    staleTime: 60_000,
  });

  function refetchAll() {
    refetchStats();
    refetchBiz();
  }

  function exportDiagnostic() {
    const payload = {
      exportedAt: now.toISOString(),
      server: devStats ?? null,
      connectivity: {
        online,
        sseStatus,
        swActive,
        timestamp: now.toISOString(),
      },
      businesses: businesses.map((b) => ({
        ownerId: b.ownerId,
        email: b.email,
        nombreNegocio: b.nombreNegocio,
        licenseStatus: b.licenseStatus,
        productCount: b.productCount,
        customerCount: b.customerCount,
        saleCount: b.saleCount,
        billingCycleEnd: b.billingCycleEnd,
        lastPaymentDate: b.lastPaymentDate,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paneldev_${now.toISOString().slice(0, 19).replace(/[T:]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const serverOk = serverHealth?.status === "ok";
  const sseBadge =
    sseStatus === "connected" ? "default" : sseStatus === "connecting" ? "secondary" : "destructive";

  const syncStatus =
    !online
      ? { label: "Sin conexión", variant: "destructive" as const }
      : sseStatus === "connected"
        ? { label: "Sincronizado", variant: "default" as const }
        : { label: "Sin eventos SSE", variant: "secondary" as const };

  const filteredBiz = businesses.filter((b) => {
    const q = bizSearch.toLowerCase();
    return (
      !q ||
      (b.email ?? "").toLowerCase().includes(q) ||
      (b.nombreNegocio ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-muted/40 p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="h-7 px-2">
              <a href="/admin">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Panel Maestro
              </a>
            </Button>
            <div>
              <h1 className="text-xl font-bold leading-none">Panel Dev</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Solo visible para administradores del sistema</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refetchAll}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Actualizar
            </Button>
            <Button size="sm" variant="outline" onClick={exportDiagnostic}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar diagnóstico
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" /> Estado del servidor
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-0.5">
              <StatusRow
                label="Servidor"
                value={
                  serverHealth == null ? (
                    <Badge variant="secondary" className="text-xs h-5">Verificando…</Badge>
                  ) : serverOk ? (
                    <Badge variant="default" className="text-xs h-5">Operativo</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs h-5">Error</Badge>
                  )
                }
              />
              <StatusRow
                label="Versión app"
                value={
                  <span className="font-mono text-xs">
                    {devStats?.appVersion ?? "—"}
                  </span>
                }
              />
              <StatusRow
                label="Node"
                value={
                  <span className="font-mono text-xs">{devStats?.nodeVersion ?? "—"}</span>
                }
              />
              <StatusRow
                label="Uptime"
                value={
                  devStats?.serverUptime != null
                    ? formatUptime(devStats.serverUptime)
                    : "—"
                }
              />
              <StatusRow
                label="Build date"
                value={devStats?.buildDate ? fmt(devStats.buildDate) : <span className="text-muted-foreground">—</span>}
              />
              <StatusRow
                label="Hora del sistema"
                value={<span className="font-mono text-xs">{now.toLocaleTimeString("es-AR")}</span>}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Wifi className="h-3.5 w-3.5" /> Conectividad
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-0.5">
              <StatusRow
                label="Red"
                value={
                  <Badge variant={online ? "default" : "destructive"} className="text-xs h-5">
                    {online ? "Online" : "Offline"}
                  </Badge>
                }
              />
              <StatusRow
                label="SSE /api/events"
                value={
                  <Badge variant={sseBadge} className="text-xs h-5 capitalize">
                    {sseStatus}
                  </Badge>
                }
              />
              <StatusRow
                label="Sincronización"
                value={
                  <Badge variant={syncStatus.variant} className="text-xs h-5">
                    {syncStatus.label}
                  </Badge>
                }
              />
              <StatusRow
                label="Offline (SW/PWA)"
                value={
                  swActive === null ? (
                    <Badge variant="secondary" className="text-xs h-5">Verificando…</Badge>
                  ) : swActive ? (
                    <Badge variant="default" className="text-xs h-5">Habilitado</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs h-5">No registrado</Badge>
                  )
                }
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Building2}
            label="Comercios"
            value={devStats?.totalBusinesses}
            loading={statsLoading}
          />
          <StatCard
            icon={Users}
            label="Usuarios"
            value={devStats?.totalUsers}
            loading={statsLoading}
          />
          <StatCard
            icon={Package}
            label="Productos"
            value={devStats?.totalProducts}
            loading={statsLoading}
          />
          <StatCard
            icon={ShoppingCart}
            label="Ventas"
            value={devStats?.totalSales}
            loading={statsLoading}
          />
        </div>

        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-medium">
              Inspección de comercios
              {!bizLoading && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({businesses.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
              <div className="space-y-2">
                <Input
                  placeholder="Buscar por email o nombre…"
                  value={bizSearch}
                  onChange={(e) => setBizSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                {bizLoading ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Cargando…</p>
                ) : filteredBiz.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sin resultados</p>
                ) : (
                  <ul className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
                    {filteredBiz.map((b) => (
                      <li key={b.ownerId}>
                        <button
                          onClick={() =>
                            setSelectedOwnerId(
                              selectedOwnerId === b.ownerId ? null : b.ownerId
                            )
                          }
                          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                            selectedOwnerId === b.ownerId
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          }`}
                        >
                          <div className="font-medium truncate">
                            {b.nombreNegocio ?? b.email ?? b.ownerId}
                          </div>
                          <div
                            className={`text-xs truncate ${
                              selectedOwnerId === b.ownerId
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            {b.licenseStatus} · {b.productCount}p · {b.saleCount}v · {b.customerCount}c
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border rounded-lg p-4 min-h-[200px]">
                {selectedOwnerId ? (
                  <BusinessInspector ownerId={selectedOwnerId} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Seleccioná un comercio para ver su detalle
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
