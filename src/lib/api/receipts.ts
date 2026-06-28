import type { ReceiptFormat } from "@/lib/receipt/types";

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

export interface ReceiptSettingsResponse {
  id: string;
  tenant_id: string;
  habilitado: boolean;
  mostrar_dialogo: boolean;
  impresion_automatica: boolean;
  descarga_automatica: boolean;
  tipo_comprobante: ReceiptFormat;
  prefijo_numeracion: string;
  proximo_numero: number;
  logo_url: string | null;
  nombre_comercial: string | null;
  razon_social: string | null;
  cuit: string | null;
  domicilio: string | null;
  telefono: string | null;
  email: string | null;
  sitio_web: string | null;
  mensaje_pie: string | null;
  created_at: string;
  updated_at: string;
}

export type ReceiptSettingsInput = Omit<ReceiptSettingsResponse, "id" | "tenant_id" | "created_at" | "updated_at">;

export async function getReceiptSettings(): Promise<ReceiptSettingsResponse | null> {
  return apiFetch("/api/receipts/settings");
}

export async function upsertReceiptSettings(input: ReceiptSettingsInput): Promise<ReceiptSettingsResponse> {
  return apiFetch("/api/receipts/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
