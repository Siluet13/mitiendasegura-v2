import { openOfflineDB, PENDING_OPS_STORE } from "./db";
import type { PendingOp } from "./db";

export type { PendingOp };

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    const tx = req.transaction;
    if (tx) {
      tx.onabort = () =>
        reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
    }
  });
}

function store(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(PENDING_OPS_STORE, mode).objectStore(PENDING_OPS_STORE);
}

export async function enqueue(type: string, payload: unknown): Promise<number> {
  const db = await openOfflineDB();
  const op: Omit<PendingOp, "id"> = {
    type,
    payload,
    timestamp: Date.now(),
    status: "pending",
  };
  const id = await idbRequest<IDBValidKey>(store(db, "readwrite").add(op));
  return id as number;
}

export async function dequeue(id: number): Promise<void> {
  const db = await openOfflineDB();
  await idbRequest(store(db, "readwrite").delete(id));
}

export async function listPending(): Promise<PendingOp[]> {
  const db = await openOfflineDB();
  return idbRequest<PendingOp[]>(
    store(db, "readonly").index("status").getAll("pending") as IDBRequest<PendingOp[]>,
  );
}

export async function updateStatus(
  id: number,
  status: "pending" | "processing",
): Promise<void> {
  const db = await openOfflineDB();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PENDING_OPS_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));

    const st = tx.objectStore(PENDING_OPS_STORE);
    const getReq = st.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as PendingOp | undefined;
      if (!existing) return;
      const updated: PendingOp = { ...existing, status };
      if (status === "processing") {
        updated.processingAt = Date.now();
      } else {
        delete updated.processingAt;
      }
      const putReq = st.put(updated);
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

async function getProcessing(): Promise<PendingOp[]> {
  const db = await openOfflineDB();
  return idbRequest<PendingOp[]>(
    store(db, "readonly").index("status").getAll("processing") as IDBRequest<PendingOp[]>,
  );
}

export async function requeueProcessingOlderThan(minutes: number): Promise<void> {
  const processing = await getProcessing();
  if (processing.length === 0) return;
  const cutoff = Date.now() - minutes * 60 * 1000;
  for (const op of processing) {
    if (op.id == null) continue;
    const since = op.processingAt ?? op.timestamp;
    if (since < cutoff) {
      await updateStatus(op.id, "pending");
    }
  }
}

export function isNetworkError(e: unknown): boolean {
  if (e instanceof DOMException) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  }
  if (!(e instanceof TypeError)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed")
  );
}

export async function clear(): Promise<void> {
  const db = await openOfflineDB();
  await idbRequest(store(db, "readwrite").clear());
}
