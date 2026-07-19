import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useTenantEvents(): void {
  const qc = useQueryClient();

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    function connect() {
      if (!active) return;

      es = new EventSource("/api/events");

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type: string;
            entities?: string[];
            kind?: string;
            productName?: string;
            stock?: number;
            stockMinimo?: number;
          };

          // ── Cache invalidation ──────────────────────────────────────────
          if (payload.type === "invalidate" && Array.isArray(payload.entities)) {
            for (const entity of payload.entities) {
              qc.invalidateQueries({ queryKey: [entity] });
            }
            // Si se invalidan productos, también refrescar el conteo de alertas
            if (payload.entities.includes("products")) {
              qc.invalidateQueries({ queryKey: ["stock_alerts"] });
            }
            return;
          }

          // ── Notificaciones de alerta de stock ───────────────────────────
          if (payload.type === "stock_alert" && payload.productName) {
            const name = payload.productName;
            switch (payload.kind) {
              case "sin_stock":
                toast.error(`${name} quedó sin stock.`, { duration: 6000 });
                break;
              case "stock_bajo":
                toast.warning(`${name} alcanzó el stock mínimo.`, { duration: 6000 });
                break;
              case "recuperado":
                toast.success(`${name} volvió a tener stock disponible.`, { duration: 5000 });
                // Refrescar alertas activas
                qc.invalidateQueries({ queryKey: ["stock_alerts"] });
                break;
            }
          }
        } catch {}
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (active) {
          retryTimer = setTimeout(connect, 5_000);
        }
      };
    }

    connect();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [qc]);
}
