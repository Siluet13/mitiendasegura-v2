async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  return res.json();
}

export interface BackupStats {
  categories: number;
  products: number;
  customers: number;
  sales: number;
  saleItems: number;
  stockMovements: number;
}

export interface BackupPayload {
  version: string;
  exportedAt: string;
  ownerId: string;
  data: {
    businessSettings: unknown;
    categories: unknown[];
    products: unknown[];
    customers: unknown[];
    sales: unknown[];
    saleItems: unknown[];
    stockMovements: unknown[];
  };
  stats: BackupStats;
}

export async function exportBackup(): Promise<void> {
  const res = await fetch("/api/backup/export", { credentials: "include" });
  if (!res.ok) throw new Error("Error al exportar el backup");
  const blob = await res.blob();
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreBackup(payload: BackupPayload): Promise<{ ok: boolean; stats: BackupStats }> {
  return apiFetch("/api/backup/restore", { method: "POST", body: JSON.stringify(payload) });
}

export function parseBackupFile(file: File): Promise<BackupPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (!json?.version || !json?.data) {
          reject(new Error("Archivo de backup inválido"));
          return;
        }
        resolve(json as BackupPayload);
      } catch {
        reject(new Error("No se pudo leer el archivo JSON"));
      }
    };
    reader.onerror = () => reject(new Error("Error al leer el archivo"));
    reader.readAsText(file);
  });
}
