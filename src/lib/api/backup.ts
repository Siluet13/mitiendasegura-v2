const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

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

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
    license?: unknown;
  };
  stats: BackupStats;
}

export async function exportBackup(): Promise<{ size: number; filename: string }> {
  const res = await fetch("/api/backup/export", { credentials: "include" });
  if (!res.ok) throw new Error("Error al exportar el backup");
  const blob = await res.blob();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `backup_${date}.json`;
  triggerDownload(blob, filename);
  return { size: blob.size, filename };
}

export async function exportXlsx(): Promise<{ filename: string }> {
  const res = await fetch("/api/backup/export/xlsx", { credentials: "include" });
  if (!res.ok) throw new Error("Error al exportar el backup Excel");
  const blob = await res.blob();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `backup_${date}.xlsx`;
  triggerDownload(blob, filename);
  return { filename };
}

export async function exportCsv(): Promise<{ filename: string }> {
  const res = await fetch("/api/backup/export/csv", { credentials: "include" });
  if (!res.ok) throw new Error("Error al exportar el backup CSV");
  const blob = await res.blob();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `backup_csv_${date}.zip`;
  triggerDownload(blob, filename);
  return { filename };
}

export async function downloadTemplate(): Promise<void> {
  const res = await fetch("/api/backup/template", { credentials: "include" });
  if (!res.ok) throw new Error("Error al descargar la plantilla");
  const blob = await res.blob();
  triggerDownload(blob, "plantilla_importacion.xlsx");
}

export interface ImportEntityPayload {
  nombre: string;
  [key: string]: unknown;
}

export interface EntityImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

export interface ImportResult {
  categories?: EntityImportResult;
  products?: EntityImportResult;
  customers?: EntityImportResult;
}

export async function importData(payload: {
  categories?: unknown[];
  products?: unknown[];
  customers?: unknown[];
}): Promise<{ results: ImportResult }> {
  return apiFetch("/api/backup/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function restoreBackup(payload: BackupPayload): Promise<{ ok: boolean; stats: BackupStats }> {
  return apiFetch("/api/backup/restore", {
    method: "POST",
    body: JSON.stringify({ ...payload, confirmRestore: true }),
  });
}

export function parseBackupFile(file: File): Promise<BackupPayload> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      reject(new Error(`El archivo supera el límite de 50 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)`));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);

        if (!json?.version || !json?.data) {
          reject(new Error("Archivo de backup inválido: faltan campos obligatorios (version, data)"));
          return;
        }

        if (typeof json.version !== "string") {
          reject(new Error("El backup tiene un campo 'version' con formato incorrecto"));
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
          d.categories.length + d.products.length + d.customers.length +
          d.sales.length + d.saleItems.length + d.stockMovements.length;
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
