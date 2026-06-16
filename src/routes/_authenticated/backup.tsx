import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { exportBackup, restoreBackup, parseBackupFile } from "@/lib/api/backup";
import type { BackupPayload } from "@/lib/api/backup";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, Clock, Download, RotateCcw, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({ meta: [{ title: "Backup y Restauración" }] }),
  component: BackupPage,
});

const HISTORY_KEY = "mts_backup_history";

interface BackupHistoryEntry {
  date: string;
  filename: string;
  size: number;
}

function getLocalHistory(): BackupHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveToLocalHistory(entry: BackupHistoryEntry): BackupHistoryEntry[] {
  const updated = [entry, ...getLocalHistory()].slice(0, 10);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function BackupPage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pending, setPending] = useState<BackupPayload | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmed2, setConfirmed2] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; label: string } | null>(null);
  const [history, setHistory] = useState<BackupHistoryEntry[]>(() => getLocalHistory());

  async function handleExport() {
    setExporting(true);
    try {
      const { size, filename } = await exportBackup();
      const updated = saveToLocalHistory({ date: new Date().toISOString(), filename, size });
      setHistory(updated);
      toast.success("Backup descargado correctamente");
    } catch (e: any) {
      toast.error(e.message ?? "Error al exportar");
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setConfirmed(false);
    setConfirmed2(false);
    setRestoreResult(null);
    try {
      const payload = await parseBackupFile(file);
      setPending(payload);
    } catch (err: any) {
      toast.error(err.message ?? "Archivo inválido");
      setPending(null);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleRestore() {
    if (!pending) return;
    setRestoring(true);
    try {
      const result = await restoreBackup(pending);
      const s = result.stats;
      setRestoreResult({
        ok: true,
        label: `Restaurado: ${s.products} productos, ${s.customers} clientes, ${s.sales} ventas, ${s.categories} categorías, ${s.stockMovements} movimientos.`,
      });
      setPending(null);
      setConfirmed(false);
      setConfirmed2(false);
      toast.success("Backup restaurado correctamente");
    } catch (e: any) {
      setRestoreResult({ ok: false, label: e.message ?? "Error al restaurar" });
      toast.error(e.message ?? "Error al restaurar");
    } finally {
      setRestoring(false);
    }
  }

  const isCrossAccount = !!(user && pending?.ownerId && pending.ownerId !== user.id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Backup y Restauración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exportá todos tus datos a un archivo JSON o restaurá desde un backup anterior.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" /> Exportar datos
          </CardTitle>
          <CardDescription>
            Descargá un archivo JSON con todos tus productos, categorías, clientes, ventas,
            movimientos de stock y configuración del negocio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? "Exportando..." : "Descargar backup"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> Restaurar backup
          </CardTitle>
          <CardDescription>
            Seleccioná un archivo de backup (.json) para restaurar tus datos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Atención:</strong> La restauración reemplaza{" "}
              <strong>todos los datos actuales</strong> por los del backup. Esta acción no se puede
              deshacer.
            </AlertDescription>
          </Alert>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={restoring}>
              <Upload className="h-4 w-4 mr-2" /> Seleccionar archivo .json
            </Button>
          </div>

          {pending && (
            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <div className="text-sm font-medium">Vista previa del backup:</div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Exportado el:</span>
                <span>{new Date(pending.exportedAt).toLocaleString("es-AR")}</span>
                <span className="text-muted-foreground">Versión:</span>
                <span>{pending.version}</span>
                {pending.app && (
                  <>
                    <span className="text-muted-foreground">Aplicación:</span>
                    <span>{pending.app}</span>
                  </>
                )}
              </div>

              {isCrossAccount && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Este backup fue creado por otra cuenta. Los datos se restaurarán en tu cuenta
                    actual, sobreescribiendo tus datos existentes.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant="secondary">{pending.stats.products} productos</Badge>
                <Badge variant="secondary">{pending.stats.categories} categorías</Badge>
                <Badge variant="secondary">{pending.stats.customers} clientes</Badge>
                <Badge variant="secondary">{pending.stats.sales} ventas</Badge>
                <Badge variant="secondary">{pending.stats.stockMovements} movimientos</Badge>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="rounded"
                  />
                  Entiendo que se reemplazarán todos los datos actuales con este backup
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmed2}
                    onChange={(e) => setConfirmed2(e.target.checked)}
                    className="rounded"
                  />
                  Confirmo que no necesito conservar los datos actuales
                </label>
              </div>

              <Button
                variant="destructive"
                disabled={!confirmed || !confirmed2 || restoring}
                onClick={handleRestore}
                className="mt-1"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {restoring ? "Restaurando..." : "Restaurar ahora"}
              </Button>
            </div>
          )}

          {restoreResult && (
            <Alert variant={restoreResult.ok ? "default" : "destructive"}>
              <AlertDescription>{restoreResult.label}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" /> Historial de exportaciones
            </CardTitle>
            <CardDescription>
              Últimos backups descargados en este dispositivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {history.map((entry, i) => (
                <li key={i} className="flex items-center justify-between py-2 gap-4">
                  <span className="font-mono text-xs text-muted-foreground truncate">
                    {entry.filename}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatBytes(entry.size)}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(entry.date).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
