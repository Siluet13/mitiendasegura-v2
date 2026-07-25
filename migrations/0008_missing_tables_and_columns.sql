-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 0008: tablas y columnas que existían en producción (vía db:push)
-- pero nunca fueron registradas como migraciones.
-- Todas las sentencias usan IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- para ser seguras tanto en instalaciones nuevas como en existentes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── products: columna initial_stock ─────────────────────────────────────────
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "initial_stock" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- ── customers: columna updated_at ───────────────────────────────────────────
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();
--> statement-breakpoint

-- ── sales: columnas de métodos de pago, estado y auditoría ──────────────────
ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "receipt_number"   text,
  ADD COLUMN IF NOT EXISTS "payment_method"   text,
  ADD COLUMN IF NOT EXISTS "paid_amount"      numeric(12,2),
  ADD COLUMN IF NOT EXISTS "credit_amount"    numeric(12,2),
  ADD COLUMN IF NOT EXISTS "transfer_amount"  numeric(12,2),
  ADD COLUMN IF NOT EXISTS "cash_amount"      numeric(12,2),
  ADD COLUMN IF NOT EXISTS "cash_session_id"  uuid,
  ADD COLUMN IF NOT EXISTS "status"           text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "deleted_at"       timestamp,
  ADD COLUMN IF NOT EXISTS "updated_at"       timestamp NOT NULL DEFAULT now();
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sales_cash_session_id_idx"
  ON "sales" ("cash_session_id");
--> statement-breakpoint

-- ── admin_logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "admin_logs" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamp     NOT NULL DEFAULT now(),
  "tenant_id"  uuid,
  "owner_id"   varchar,
  "user_id"    varchar,
  "level"      text          NOT NULL DEFAULT 'info',
  "module"     varchar(64)   NOT NULL,
  "event"      varchar(128)  NOT NULL,
  "message"    text          NOT NULL,
  "details"    jsonb
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_logs_created_at_idx" ON "admin_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_logs_owner_id_idx"   ON "admin_logs" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_logs_tenant_id_idx"  ON "admin_logs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_logs_level_idx"      ON "admin_logs" ("level");
--> statement-breakpoint

-- ── receipt_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "receipt_settings" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"             uuid        NOT NULL,
  "owner_id"              varchar     NOT NULL,
  "habilitado"            boolean     NOT NULL DEFAULT false,
  "mostrar_dialogo"       boolean     NOT NULL DEFAULT true,
  "impresion_automatica"  boolean     NOT NULL DEFAULT false,
  "descarga_automatica"   boolean     NOT NULL DEFAULT false,
  "tipo_comprobante"      text        NOT NULL DEFAULT 'ticket_80mm',
  "prefijo_numeracion"    text        NOT NULL DEFAULT 'V',
  "proximo_numero"        integer     NOT NULL DEFAULT 1,
  "logo_url"              text,
  "nombre_comercial"      text,
  "razon_social"          text,
  "cuit"                  text,
  "domicilio"             text,
  "telefono"              text,
  "email"                 text,
  "sitio_web"             text,
  "mensaje_pie"           text,
  "created_at"            timestamp   NOT NULL DEFAULT now(),
  "updated_at"            timestamp   NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "receipt_settings_tenant_id_idx"
  ON "receipt_settings" ("tenant_id");
