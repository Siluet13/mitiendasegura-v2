import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { exportBackup, restoreBackup, parseBackupFile } from "@/lib/api/backup";
import type { BackupPayload } from "@/lib/api/backup";
import { toast } from "sonner";
import { AlertTriangle, Download, RotateCcw, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({ meta: [{ title: "Backup y Restauración" }] }),
  component: BackupPage,
});

function BackupPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pending, setPending] = useState<BackupPayload | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; label: string } | null>(null);

  async function handleExport() {
    setExporting(true);
    try {
      await exportBackup();
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
      toast.success("Backup restaurado correctamente");
    } catch (e: any) {
      setRestoreResult({ ok: false, label: e.message ?? "Error al restaurar" });
      toast.error(e.message ?? "Error al restaurar");
    } finally {
      setRestoring(false);
    }
  }

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
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant="secondary">{pending.stats.products} productos</Badge>
                <Badge variant="secondary">{pending.stats.categories} categorías</Badge>
                <Badge variant="secondary">{pending.stats.customers} clientes</Badge>
                <Badge variant="secondary">{pending.stats.sales} ventas</Badge>
                <Badge variant="secondary">{pending.stats.stockMovements} movimientos</Badge>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none mt-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="rounded"
                />
                Entiendo que se reemplazarán todos los datos actuales con este backup
              </label>
              <Button
                variant="destructive"
                disabled={!confirmed || restoring}
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
    </div>
  );
}
