import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePendingOps } from "@/hooks/usePendingOps";
import { syncAllPending } from "@/lib/offline/sync";

export const Route = createFileRoute("/_authenticated/offline")({
  head: () => ({ meta: [{ title: "Sincronización" }] }),
  component: OfflinePage,
});

const OP_LABELS: Record<string, string> = {
  sale: "Venta",
  product_create: "Producto",
  customer_create: "Cliente",
  category_create: "Categoría",
};

function OfflinePage() {
  const qc = useQueryClient();
  const isOnline = useOnlineStatus();
  const { ops, total, refresh } = usePendingOps();
  const [syncing, setSyncing] = useState(false);

  const breakdown = ops.reduce<Record<string, number>>((acc, op) => {
    acc[op.type] = (acc[op.type] ?? 0) + 1;
    return acc;
  }, {});

  const handleSyncAll = useCallback(async () => {
    if (!isOnline && !navigator.onLine) {
      toast.error("Sin conexión. Conectate a internet para sincronizar.");
      return;
    }
    setSyncing(true);
    try {
      await syncAllPending(qc);
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [isOnline, qc, refresh]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sincronización</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estado de la conexión y operaciones pendientes.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estado de conexión</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          {isOnline ? (
            <>
              <Wifi className="h-5 w-5 text-green-500" />
              <Badge className="bg-green-500 hover:bg-green-500">En línea</Badge>
            </>
          ) : (
            <>
              <WifiOff className="h-5 w-5 text-destructive" />
              <Badge variant="destructive">Sin conexión</Badge>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Operaciones pendientes</CardTitle>
          <CardDescription>
            {total === 0
              ? "No hay operaciones pendientes de sincronizar."
              : `${total} operación${total !== 1 ? "es" : ""} en cola.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.keys(breakdown).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(breakdown).map(([type, count]) => (
                <Badge key={type} variant="secondary">
                  {OP_LABELS[type] ?? type}: {count}
                </Badge>
              ))}
            </div>
          )}

          {ops.length > 0 && (
            <div className="rounded-md border text-sm divide-y">
              {ops.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between px-3 py-2 gap-4"
                >
                  <span className="font-medium">{OP_LABELS[op.type] ?? op.type}</span>
                  <span className="text-muted-foreground text-xs shrink-0">
                    {new Date(op.timestamp).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleSyncAll}
            disabled={syncing || total === 0}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : total === 0 ? "Sin pendientes" : "Sincronizar ahora"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
