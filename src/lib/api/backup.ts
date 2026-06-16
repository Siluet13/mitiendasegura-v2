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
  app?: string;
  exportedAt: string;
  ownerId: string;
  tenantId?: string;
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
          reject(new Error("Archivo de backup inválido: faltan campos obligatorios (version, data)"));
          return;
        }

        const d = json.data;
        if (
          !Array.isArray(d.categories) ||
          !Array.isArray(d.products) ||
          !Array.isArray(d.customers) ||
          !Array.isArray(d.sales) ||
          !Array.isArray(d.saleItems) ||
          !Array.isArray(d.stockMovements)
        ) {
          reject(new Error("El backup tiene una estructura de datos inválida"));
          return;
        }

        if (json.exportedAt && isNaN(Date.parse(json.exportedAt))) {
          reject(new Error("El backup tiene una fecha de exportación inválida"));
          return;
        }

        const totalItems =
          d.categories.length +
          d.products.length +
          d.customers.length +
          d.sales.length +
          d.saleItems.length +
          d.stockMovements.length;
        if (totalItems === 0 && !d.businessSettings) {
          reject(new Error("El backup está vacío y no contiene datos para restaurar"));
          return;
        }

        resolve(json as BackupPayload);
      } catch {
        reject(new Error("No se pudo leer el archivo. Verificá que sea un JSON válido"));
      }
    };
    reader.onerror = () => reject(new Error("Error al leer el archivo"));
    reader.readAsText(file);
  });
}
