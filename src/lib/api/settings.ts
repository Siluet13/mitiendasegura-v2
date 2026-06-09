import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

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

export type BusinessSettingsInput = Omit<
  BusinessSettings,
  "id" | "owner_id" | "created_at" | "updated_at"
>;

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetches the business settings for the current owner.
 * Returns null when no settings have been saved yet.
 */
export async function getBusinessSettings(): Promise<BusinessSettings | null> {
  const { data, error } = await supabase
    .from("business_settings")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data as BusinessSettings) ?? null;
}

/**
 * Creates or updates the business settings for the current owner.
 * Uses upsert with conflict resolution on owner_id (enforced by UNIQUE constraint).
 * owner_id is injected automatically by the set_owner_id() DB trigger on INSERT.
 *
 * Future-ready: adding company_id / branch_id here enables multiempresa/sucursales
 * without modifying the core upsert logic.
 */
export async function upsertBusinessSettings(
  input: BusinessSettingsInput,
): Promise<BusinessSettings> {
  const payload = {
    ...input,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("business_settings")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(payload as any, { onConflict: "owner_id" })
    .select()
    .single();

  if (error) throw error;
  return data as BusinessSettings;
}
