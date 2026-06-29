import { ConflictError } from "./errors";

export { ConflictError };

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (res.status === 409) throw new ConflictError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  return res.json();
}

export interface BusinessSettings {
  id: string;
  owner_id: string;
  nombre_negocio: string;
  razon_social: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  ciudad: string | null;
  provincia: string | null;
  pais: string | null;
  moneda: string;
  simbolo_moneda: string;
  decimales: number;
  logo_url: string | null;
  mensaje_tickets: string | null;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export type BusinessSettingsInput = Omit<BusinessSettings, "id" | "owner_id" | "created_at" | "updated_at">;

export async function getBusinessSettings(): Promise<BusinessSettings | null> {
  return apiFetch("/api/settings");
}

export async function upsertBusinessSettings(
  input: BusinessSettingsInput,
  knownUpdatedAt?: string | null,
): Promise<BusinessSettings> {
  const headers: Record<string, string> = {};
  if (knownUpdatedAt) headers["X-If-Unmodified-Since"] = knownUpdatedAt;
  return apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(input), headers });
}
