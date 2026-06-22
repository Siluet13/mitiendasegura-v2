import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FlaskConical, RefreshCw, Trash2 } from "lucide-react";
import { openOfflineDB, PENDING_OPS_STORE, type PendingOp } from "@/lib/offline/db";
import { enqueue } from "@/lib/offline/queue";
import { getLogs, clearLogs, type LogEntry } from "@/lib/offline/logger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/offline-debug")({
  head: () => ({ meta: [{ title: "Diagnóstico Offline" }] }),
  component: OfflineDebugPage,
});

async function readAllOps(): Promise<PendingOp[]> {
  try {
    const db = await openOfflineDB();
    return new Promise<PendingOp[]>((resolve, reject) => {
      const tx = db.transaction(PENDING_OPS_STORE, "readonly");
      const st = tx.objectStore(PENDING_OPS_STORE);
      const req = st.getAll();
      req.onsuccess = () => resolve((req.result as PendingOp[]).sort((a, b) => b.timestamp - a.timestamp));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fmtFull(ts: number): string {
  return new Date(ts).toLocaleString("es-AR");
}

function levelColor(level: LogEntry["level"]): string {
  switch (level) {
    case "error": return "text-red-600";
    case "warn": return "text-yellow-600";
    case "debug": return "text-blue-500";
    default: return "text-green-700";
  }
}

function statusBadge(status: string) {
  if (status === "pending") return <Badge variant="outline" className="text-xs">pending</Badge>;
  if (status === "processing") return <Badge variant="secondary" className="text-xs">processing</Badge>;
  return <Badge className="text-xs">{status}</Badge>;
}

function OfflineDebugPage() {
  const [ops, setOps] = useState<PendingOp[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedOps, setExpandedOps] = useState<Set<number>>(new Set());
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [testResult, setTestResult] = useState<string[] | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const allOps = await readAllOps();
      setOps(allOps);
      setLogs([...getLogs()].reverse());
      setLastRefresh(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    intervalRef.current = setInterval(() => void refresh(), 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const pending = ops.filter((o) => o.status === "pending").length;
  const processing = ops.filter((o) => o.status === "processing").length;

  const lastEnqueue = logs.find((l) => l.event === "ENQUEUE_SUCCESS");
  const lastSyncOk = logs.find((l) => l.event === "SYNC_SUCCESS");
  const lastSyncStart = logs.find((l) => l.event === "SYNC_START");

  function toggleOp(id: number) {
    setExpandedOps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleLog(idx: number) {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handleClearLogs() {
    clearLogs();
    setLogs([]);
  }

  function handleExport() {
    const data = {
      exportedAt: new Date().toISOString(),
      navigatorOnLine: navigator.onLine,
      pendingOps: ops,
      logs: getLogs(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mts-offline-diag-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function runAutoTest() {
    setTestRunning(true);
    setTestResult(null);
    const ts = Date.now();
    const results: string[] = [];

    try {
      const catId = await enqueue("category_create", { nombre: `TEST_CAT_${ts}` });
      results.push(`✅ category_create enqueued → id: ${catId}`);
    } catch (e) {
      results.push(`❌ category_create falló: ${String(e)}`);
    }

    try {
      const prodId = await enqueue("product_create", {
        nombre: `TEST_PROD_${ts}`,
        precio: 100,
        costo: 50,
        stock: 10,
        stock_minimo: 1,
        activo: true,
        category_id: null,
        descripcion: null,
        sku: `SKU-TEST-${ts}`,
        codigo_barras: null,
        offline_id: `TEST-${ts}`,
      });
      results.push(`✅ product_create enqueued → id: ${prodId}`);
    } catch (e) {
      results.push(`❌ product_create falló: ${String(e)}`);
    }

    try {
      const custId = await enqueue("customer_create", {
        nombre: `TEST_CUST_${ts}`,
        telefono: null,
        email: null,
        direccion: null,
        observaciones: null,
      });
      results.push(`✅ customer_create enqueued → id: ${custId}`);
    } catch (e) {
      results.push(`❌ customer_create falló: ${String(e)}`);
    }

    try {
      const saleId = await enqueue("sale", {
        items: [{ product_id: `TEST-${ts}`, cantidad: 1, precio_unitario: 100 }],
        observacion: "Venta de prueba offline",
        customer_id: null,
        client_id: crypto.randomUUID(),
      });
      results.push(`✅ sale enqueued → id: ${saleId}`);
    } catch (e) {
      results.push(`❌ sale falló: ${String(e)}`);
    }

    await refresh();
    const newTotal = await readAllOps();
    results.push(`\n📦 Total en IDB después del test: ${newTotal.length} ops`);
    results.push(`📋 Logs capturados: ${getLogs().length}`);

    setTestResult(results);
    setTestRunning(false);
  }

  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <a href="/admin"><ArrowLeft className="h-4 w-4 mr-1" />Volver</a>
            </Button>
            <h1 className="text-xl font-bold">Diagnóstico Offline</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {lastRefresh > 0 && `Actualizado: ${fmtTime(lastRefresh)}`}
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refrescar
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Exportar JSON
            </Button>
          </div>
        </div>

        {/* SECCIÓN 1 — ESTADO GENERAL */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              1 · Estado general
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <Stat
                label="navigator.onLine"
                value={navigator.onLine ? "✅ Online" : "🔴 Offline"}
                accent={navigator.onLine ? "text-green-600" : "text-red-600"}
              />
              <Stat label="Total en IDB" value={String(ops.length)} />
              <Stat label="Pending" value={String(pending)} />
              <Stat label="Processing" value={String(processing)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <TimeRow label="Último enqueue" entry={lastEnqueue} />
              <TimeRow label="Último sync inicio" entry={lastSyncStart} />
              <TimeRow label="Último sync exitoso" entry={lastSyncOk} />
            </div>
          </CardContent>
        </Card>

        {/* SECCIÓN 2 — COLA INDEXEDDB */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
              <span>2 · Cola IndexedDB — pending_ops ({ops.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {ops.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin operaciones en cola</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2 font-medium">ID</th>
                      <th className="text-left px-4 py-2 font-medium">Tipo</th>
                      <th className="text-left px-4 py-2 font-medium">Estado</th>
                      <th className="text-left px-4 py-2 font-medium">Timestamp</th>
                      <th className="text-left px-4 py-2 font-medium">Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((op) => {
                      const id = op.id ?? 0;
                      const isExpanded = expandedOps.has(id);
                      return (
                        <>
                          <tr key={id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2 font-mono text-muted-foreground">{id}</td>
                            <td className="px-4 py-2">
                              <code className="bg-muted rounded px-1 py-0.5">{op.type}</code>
                            </td>
                            <td className="px-4 py-2">{statusBadge(op.status)}</td>
                            <td className="px-4 py-2 text-muted-foreground">{fmtFull(op.timestamp)}</td>
                            <td className="px-4 py-2">
                              <button
                                onClick={() => toggleOp(id)}
                                className="text-primary underline underline-offset-2 hover:no-underline text-xs"
                              >
                                {isExpanded ? "ocultar" : "ver payload"}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${id}-payload`} className="bg-muted/20">
                              <td colSpan={5} className="px-4 py-3">
                                <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all bg-background border rounded p-3">
                                  {JSON.stringify(op.payload, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECCIÓN 3 — EVENT LOG */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
              <span>3 · Event log — mts_offline_logs ({logs.length})</span>
              <Button variant="ghost" size="sm" onClick={handleClearLogs} className="h-7 text-xs text-destructive">
                <Trash2 className="h-3 w-3 mr-1" />Limpiar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin logs registrados</p>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b z-10">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Hora</th>
                      <th className="text-left px-4 py-2 font-medium">Level</th>
                      <th className="text-left px-4 py-2 font-medium">Evento</th>
                      <th className="text-left px-4 py-2 font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((entry, idx) => {
                      const isExpanded = expandedLogs.has(idx);
                      return (
                        <>
                          <tr key={idx} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-1.5 font-mono text-muted-foreground whitespace-nowrap">
                              {fmtTime(entry.timestamp)}
                            </td>
                            <td className={`px-4 py-1.5 font-semibold uppercase ${levelColor(entry.level)}`}>
                              {entry.level}
                            </td>
                            <td className="px-4 py-1.5">
                              <code className="bg-muted rounded px-1">{entry.event}</code>
                            </td>
                            <td className="px-4 py-1.5">
                              {entry.data != null ? (
                                <button
                                  onClick={() => toggleLog(idx)}
                                  className="text-primary underline underline-offset-2 hover:no-underline text-xs"
                                >
                                  {isExpanded ? "ocultar" : "ver data"}
                                </button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && entry.data != null && (
                            <tr key={`${idx}-data`} className="bg-muted/20">
                              <td colSpan={4} className="px-4 py-2">
                                <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all bg-background border rounded p-2">
                                  {JSON.stringify(entry.data, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECCIÓN 4 — AUTO-TEST */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              4 · Prueba automática offline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Inserta 4 operaciones directamente en IndexedDB (category_create, product_create, customer_create, sale)
              y verifica que aparezcan en la cola. Si estás online y reconectás, deberían sincronizarse.
            </p>
            <Button
              onClick={() => void runAutoTest()}
              disabled={testRunning}
              className="gap-2"
            >
              <FlaskConical className="h-4 w-4" />
              {testRunning ? "Ejecutando..." : "Ejecutar prueba"}
            </Button>
            {testResult && (
              <pre className="text-xs font-mono bg-muted rounded p-4 overflow-x-auto whitespace-pre-wrap border">
                {testResult.join("\n")}
              </pre>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function Stat({ label, value, accent = "" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function TimeRow({ label, entry }: { label: string; entry: LogEntry | undefined }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      {entry ? (
        <span className="font-mono">{new Date(entry.timestamp).toLocaleString("es-AR")}</span>
      ) : (
        <span className="text-muted-foreground italic">sin registros</span>
      )}
    </div>
  );
}
