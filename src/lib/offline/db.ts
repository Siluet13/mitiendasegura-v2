const DB_NAME = "mi-tienda-offline";
const DB_VERSION = 1;
const STORE = "pending_ops";

export interface PendingOp {
  id?: number;
  type: string;
  payload: unknown;
  timestamp: number;
  status: "pending" | "processing";
  processingAt?: number;
}

export const PENDING_OPS_STORE = STORE;

export function openOfflineDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("status", "status", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
