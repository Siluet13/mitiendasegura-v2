import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getLogs } from "@/lib/offline/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";

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

interface CapturedError {
  ts: number;
  message: string;
  stack?: string;
}

function useErrorCapture(max = 50): CapturedError[] {
  const ref = useRef<CapturedError[]>([]);
  const [, tick] = useState(0);

  const push = useCallback(
    (entry: CapturedError) => {
      ref.current = [...ref.current, entry].slice(-max);
      tick((n) => n + 1);
    },
    [max]
  );

  useEffect(() => {
    const orig = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      orig(...args);
      push({ ts: Date.now(), message: args.map(String).join(" ") });
    };
    const onErr = (e: ErrorEvent) =>
      push({ ts: Date.now(), message: e.message, stack: e.error?.stack });
    const onRej = (e: PromiseRejectionEvent) =>
      push({ ts: Date.now(), message: `Unhandled: ${e.reason}`, stack: e.reason?.stack });
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      console.error = orig;
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, [push]);

  return ref.current;
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      <span className={`text-sm text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function DevPage() {
  const { user } = useAuth();
  const online = useOnlineStatus();
  const sseStatus = useEventSourceStatus();
  const errors = useErrorCapture(50);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  const { data: kpis, isLoading: kpisLoading, refetch: refetchKpis } = useQuery<{
    salesToday: number;
    salesMonth: number;
    activeProducts: number;
    totalCustomers: number;
  }>({
    queryKey: ["dashboard-kpis"],
    queryFn: () =>
      fetch("/api/dashboard/kpis", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: productsCount, refetch: refetchProducts } = useQuery<number>({
    queryKey: ["products"],
    queryFn: () =>
      fetch("/api/inventory/products", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d.length : d?.length ?? 0)),
    select: (d) => (typeof d === "number" ? d : (d as any)?.length ?? 0),
    staleTime: 60_000,
  });

  const { data: categoriesCount } = useQuery<number>({
    queryKey: ["categories"],
    queryFn: () =>
      fetch("/api/inventory/categories", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d.length : 0)),
    select: (d) => (typeof d === "number" ? d : (d as any[])?.length ?? 0),
    staleTime: 60_000,
  });

  const { data: salesCount } = useQuery<number>({
    queryKey: ["sales"],
    queryFn: () =>
      fetch("/api/inventory/sales", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d.length : 0)),
    select: (d) => (typeof d === "number" ? d : (d as any[])?.length ?? 0),
    staleTime: 60_000,
  });

  const { data: stockCount } = useQuery<number>({
    queryKey: ["stock_movements"],
    queryFn: () =>
      fetch("/api/inventory/stock-movements", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d.length : 0)),
    select: (d) => (typeof d === "number" ? d : (d as any[])?.length ?? 0),
    staleTime: 60_000,
  });

  const offlineLogs = getLogs();

  function refetchAll() {
    refetchKpis();
    refetchProducts();
  }

  function exportDiagnostic() {
    const payload = {
      exportedAt: now.toISOString(),
      system: {
        userId: user?.id ?? null,
        email: (user as any)?.email ?? null,
        onlineStatus: online ? "online" : "offline",
        sseStatus,
        timestamp: now.toISOString(),
      },
      counts: {
        products: productsCount ?? null,
        activeProducts: kpis?.activeProducts ?? null,
        categories: categoriesCount ?? null,
        customers: kpis?.totalCustomers ?? null,
        sales: salesCount ?? null,
        stockMovements: stockCount ?? null,
        revenueToday: kpis?.salesToday ?? null,
        revenueMonth: kpis?.salesMonth ?? null,
      },
      errorLogs: errors,
      offlineLogs: offlineLogs.slice(-50),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnostico_${now.toISOString().slice(0, 19).replace(/[T:]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sseBadge =
    sseStatus === "connected"
      ? "default"
      : sseStatus === "connecting"
        ? "secondary"
        : "destructive";

  return (
    <div className="max-w-2xl mx-auto space-y-5 p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Panel Dev</h1>
          <p className="text-xs text-muted-foreground">Solo visible para administradores del sistema</p>
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

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Estado del sistema</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-0.5">
          <Row label="User ID" value={user?.id ?? "—"} mono />
          <Row label="Email" value={(user as any)?.email ?? "—"} />
          <Row label="Rol" value="admin" />
          <Row
            label="Red"
            value={
              <Badge variant={online ? "default" : "destructive"} className="text-xs h-5">
                {online ? "Online" : "Offline"}
              </Badge>
            }
          />
          <Row
            label="SSE /api/events"
            value={
              <Badge variant={sseBadge} className="text-xs h-5 capitalize">
                {sseStatus}
              </Badge>
            }
          />
          <Row label="Hora del sistema" value={now.toLocaleString("es-AR")} mono />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Datos del tenant</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-0.5">
          {kpisLoading ? (
            <p className="text-xs text-muted-foreground">Cargando...</p>
          ) : (
            <>
              <Row label="Productos (total)" value={productsCount ?? "—"} />
              <Row label="Productos (activos)" value={kpis?.activeProducts ?? "—"} />
              <Row label="Categorías" value={categoriesCount ?? "—"} />
              <Row label="Clientes" value={kpis?.totalCustomers ?? "—"} />
              <Row label="Ventas" value={salesCount ?? "—"} />
              <Row label="Movimientos de stock" value={stockCount ?? "—"} />
              <Row
                label="Revenue hoy"
                value={
                  kpis?.salesToday != null
                    ? `$${Number(kpis.salesToday).toLocaleString("es-AR")}`
                    : "—"
                }
              />
              <Row
                label="Revenue este mes"
                value={
                  kpis?.salesMonth != null
                    ? `$${Number(kpis.salesMonth).toLocaleString("es-AR")}`
                    : "—"
                }
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">
            Errores capturados — sesión actual ({errors.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {errors.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin errores en esta sesión.</p>
          ) : (
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {[...errors].reverse().map((e, i) => (
                <li key={i} className="text-xs border rounded p-2 space-y-0.5 font-mono">
                  <p className="text-muted-foreground">{new Date(e.ts).toLocaleTimeString("es-AR")}</p>
                  <p className="text-red-500 break-all">{e.message}</p>
                  {e.stack && (
                    <p className="text-muted-foreground break-all text-[10px] whitespace-pre-wrap">
                      {e.stack.slice(0, 400)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">
            Logs offline recientes — {offlineLogs.length} entradas totales
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {offlineLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin logs offline guardados.</p>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto font-mono">
              {[...offlineLogs]
                .reverse()
                .slice(0, 30)
                .map((e, i) => (
                  <li key={i} className="text-xs flex gap-2 items-start">
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {new Date(e.timestamp).toLocaleTimeString("es-AR")}
                    </span>
                    <Badge
                      variant={e.level === "error" ? "destructive" : "secondary"}
                      className="text-[10px] px-1 h-4 shrink-0"
                    >
                      {e.level}
                    </Badge>
                    <span className="text-foreground">{e.event}</span>
                    {e.data !== undefined && (
                      <span className="text-muted-foreground truncate">
                        {typeof e.data === "string"
                          ? e.data.slice(0, 80)
                          : JSON.stringify(e.data).slice(0, 80)}
                      </span>
                    )}
                  </li>
                ))}
              {offlineLogs.length > 30 && (
                <li className="text-xs text-muted-foreground pt-1">
                  … y {offlineLogs.length - 30} entradas más (exportá el diagnóstico para verlas todas)
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
