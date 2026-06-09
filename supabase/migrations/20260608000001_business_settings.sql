-- =========================================================
-- BUSINESS SETTINGS
-- Configuración general del negocio/comercio.
-- Una única fila por owner_id (UNIQUE constraint).
-- Preparada para: reportes, tickets, PDF, multiempresa,
--   sucursales, facturación fiscal, cuenta corriente.
-- =========================================================

CREATE TABLE public.business_settings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID        NOT NULL,

  -- Datos del negocio
  nombre_negocio   TEXT        NOT NULL,
  razon_social     TEXT,
  telefono         TEXT,
  email            TEXT,
  direccion        TEXT,
  ciudad           TEXT,
  provincia        TEXT,
  pais             TEXT,

  -- Configuración monetaria
  moneda           TEXT        NOT NULL DEFAULT 'ARS',
  simbolo_moneda   TEXT        NOT NULL DEFAULT '$',
  decimales        INTEGER     NOT NULL DEFAULT 2
                               CONSTRAINT business_settings_decimales_check
                               CHECK (decimales BETWEEN 0 AND 4),

  -- Identidad visual
  logo_url         TEXT,

  -- Información adicional (futura: tickets, reportes)
  mensaje_tickets  TEXT,
  observaciones    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_settings_owner_unique UNIQUE (owner_id),
  CONSTRAINT business_settings_email_check CHECK (
    email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

-- ── Índices ──────────────────────────────────────────────
CREATE INDEX business_settings_owner_id_idx ON public.business_settings(owner_id);

-- ── Permisos ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;

-- ── RLS ──────────────────────────────────────────────────
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_settings_select_own" ON public.business_settings
  FOR SELECT TO authenticated
  USING (owner_id = public.current_owner_id());

CREATE POLICY "business_settings_insert_own" ON public.business_settings
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_owner_id() OR owner_id IS NULL);

CREATE POLICY "business_settings_update_own" ON public.business_settings
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_owner_id())
  WITH CHECK (owner_id = public.current_owner_id());

CREATE POLICY "business_settings_delete_own" ON public.business_settings
  FOR DELETE TO authenticated
  USING (owner_id = public.current_owner_id());

-- ── Trigger: set_owner_id ─────────────────────────────────
CREATE TRIGGER business_settings_set_owner_id
  BEFORE INSERT ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

-- ── Trigger: updated_at automático ───────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
