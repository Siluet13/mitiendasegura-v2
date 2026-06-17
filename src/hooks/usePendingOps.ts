import { useState, useEffect, useCallback } from "react";
import { listPending } from "@/lib/offline/queue";
import type { PendingOp } from "@/lib/offline/queue";

export type { PendingOp };

export function usePendingOps(): {
  ops: PendingOp[];
  total: number;
  refresh: () => Promise<void>;
} {
  const [ops, setOps] = useState<PendingOp[]>([]);

  const refresh = useCallback(async () => {
    try {
      setOps(await listPending());
    } catch {
      setOps([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { ops, total: ops.length, refresh };
}
