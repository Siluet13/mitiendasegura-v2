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

let _db: IDBDatabase | null = null;
let _opening: Promise<IDBDatabase> | null = null;

export function openOfflineDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;

  _opening = new Promise<IDBDatabase>((resolve, reject) => {
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

    req.onsuccess = () => {
      _db = req.result;
      _db.onclose = () => {
        _db = null;
        _opening = null;
      };
      _db.onversionchange = () => {
        _db?.close();
        _db = null;
        _opening = null;
      };
      _opening = null;
      resolve(_db);
    };

    req.onerror = () => {
      _opening = null;
      reject(req.error);
    };

    req.onblocked = () => {
      _opening = null;
      reject(new Error("IndexedDB bloqueada por otra conexión"));
    };
  });

  return _opening;
}
