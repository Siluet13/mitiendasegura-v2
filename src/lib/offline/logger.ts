export type LogLevel = "info" | "warn" | "error" | "debug";

export type LogEvent =
  | "ENQUEUE_START"
  | "ENQUEUE_SUCCESS"
  | "ENQUEUE_ERROR"
  | "SYNC_START"
  | "SYNC_SUCCESS"
  | "SYNC_ERROR"
  | "NETWORK_OFFLINE"
  | "NETWORK_ONLINE"
  | "PRODUCT_CREATE_START"
  | "PRODUCT_CREATE_ENQUEUED"
  | "PRODUCT_CREATE_SYNCED"
  | "CATEGORY_CREATE_START"
  | "CATEGORY_CREATE_ENQUEUED"
  | "CATEGORY_CREATE_SYNCED"
  | "CUSTOMER_CREATE_START"
  | "CUSTOMER_CREATE_ENQUEUED"
  | "CUSTOMER_CREATE_SYNCED"
  | "SALE_CREATE_START"
  | "SALE_CREATE_ENQUEUED"
  | "SALE_CREATE_SYNCED"
  | "IDB_ERROR"
  | "FETCH_TIMEOUT"
  | "FETCH_FAILED"
  | "RQ_CACHE_RESTORED"
  | "RQ_CACHE_SAVED"
  | "MUTATION_START"
  | "MUTATION_SUCCESS"
  | "MUTATION_ERROR"
  | "MUTATION_SETTLED"
  | "DIALOG_CLOSE"
  | "FORM_RESET"
  | "SALE_SYNC_START"
  | "SALE_SYNC_SUCCESS"
  | "SALE_SYNC_ERROR"
  | "RECONNECT_DETECTED"
  | "AUTO_SYNC_START"
  | "AUTO_SYNC_SUCCESS"
  | "AUTO_SYNC_ERROR"
  | "PRODUCT_ID_MAPPED"
  | "SALE_PRODUCT_ID_RESOLVED"
  | "FORM_OPEN"
  | "FORM_REOPEN"
  | "FORM_CLOSE"
  | "MUTATION_STATE_CHANGE"
  | "MUTATION_BEFORE_AWAIT"
  | "MUTATION_AFTER_AWAIT"
  | "OFFLINE_RETURN_START"
  | "AFTER_MUTATE_ASYNC"
  | "PRODUCT_CACHE_OPTIMISTIC"
  | "SALE_DIALOG_CLOSE"
  | "SALE_DIALOG_CLOSED"
  | "SALE_MUTATION_SUCCESS"
  | "SALE_MUTATION_SETTLED";

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  event: LogEvent;
  data?: unknown;
}

const STORAGE_KEY = "mts_offline_logs";
const MAX_LOGS = 500;

function readRaw(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function writeRaw(entries: LogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

export function log(event: LogEvent, data?: unknown, level: LogLevel = "info"): void {
  if (typeof window === "undefined") return;
  const entry: LogEntry = { timestamp: Date.now(), level, event, data };
  const entries = readRaw();
  entries.push(entry);
  if (entries.length > MAX_LOGS) {
    entries.splice(0, entries.length - MAX_LOGS);
  }
  writeRaw(entries);
}

export function getLogs(): LogEntry[] {
  return readRaw();
}

export function clearLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
