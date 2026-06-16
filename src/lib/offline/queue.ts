import { openOfflineDB, PENDING_OPS_STORE } from "./db";
import type { PendingOp } from "./db";

export type { PendingOp };

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode
): IDBObjectStore {
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
  const store = tx(db, "readonly");
  const index = store.index("status");
  const result = await request<PendingOp[]>(
    index.getAll("pending") as IDBRequest<PendingOp[]>
  );
  db.close();
  return result;
}

export async function clear(): Promise<void> {
  const db = await openOfflineDB();
  await request(tx(db, "readwrite").clear());
  db.close();
}
