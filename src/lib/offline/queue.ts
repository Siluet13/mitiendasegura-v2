import { openOfflineDB, PENDING_OPS_STORE } from "./db";
import type { PendingOp } from "./db";

export type { PendingOp };

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(PENDING_OPS_STORE, mode).objectStore(PENDING_OPS_STORE);
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(type: string, payload: unknown): Promise<number> {
  const db = await openOfflineDB();
  const op: Omit<PendingOp, "id"> = {
    type,
    payload,
    timestamp: Date.now(),
    status: "pending",
  };
  const id = await request<IDBValidKey>(tx(db, "readwrite").add(op));
  db.close();
  return id as number;
}

export async function dequeue(id: number): Promise<void> {
  const db = await openOfflineDB();
  await request(tx(db, "readwrite").delete(id));
  db.close();
}

export async function listPending(): Promise<PendingOp[]> {
  const db = await openOfflineDB();
  const index = tx(db, "readonly").index("status");
  const result = await request<PendingOp[]>(
    index.getAll("pending") as IDBRequest<PendingOp[]>
  );
  db.close();
  return result;
}

export async function updateStatus(
  id: number,
  status: "pending" | "processing",
): Promise<void> {
  const db = await openOfflineDB();
  const transaction = db.transaction(PENDING_OPS_STORE, "readwrite");
  const store = transaction.objectStore(PENDING_OPS_STORE);
  const existing = await request<PendingOp | undefined>(
    store.get(id) as IDBRequest<PendingOp | undefined>
  );
  if (!existing) {
    db.close();
    return;
  }
  const updated: PendingOp = { ...existing, status };
  if (status === "processing") {
    updated.processingAt = Date.now();
  } else {
    delete updated.processingAt;
  }
  await request(store.put(updated));
  db.close();
}

export async function getProcessing(): Promise<PendingOp[]> {
  const db = await openOfflineDB();
  const index = tx(db, "readonly").index("status");
  const result = await request<PendingOp[]>(
    index.getAll("processing") as IDBRequest<PendingOp[]>
  );
  db.close();
  return result;
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
  await request(tx(db, "readwrite").clear());
  db.close();
}
