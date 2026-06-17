import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const ENTITY_KEYS: Record<string, string[]> = {
  products: "products",
  sales: "sales",
  customers: "customers",
  categories: "categories",
  stock_movements: "stock_movements",
} as unknown as Record<string, string[]>;

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
          };
          if (payload.type !== "invalidate" || !Array.isArray(payload.entities)) return;
          for (const entity of payload.entities) {
            qc.invalidateQueries({ queryKey: [entity] });
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
