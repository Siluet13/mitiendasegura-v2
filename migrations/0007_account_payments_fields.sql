-- Forma de pago para movimientos de cuenta corriente (tipo "payment")
ALTER TABLE "customer_account_movements"
  ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR;
--> statement-breakpoint

-- Crear tabla de sesiones de caja (incluye columnas de cobros de cuenta corriente)
-- IF NOT EXISTS garantiza idempotencia en instancias que ya la tenían
CREATE TABLE IF NOT EXISTS "cash_register_sessions" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"                uuid          NOT NULL,
  "user_id"                  varchar       NOT NULL,
  "opened_at"                timestamp     NOT NULL DEFAULT now(),
  "closed_at"                timestamp,
  "initial_amount"           numeric(12,2) NOT NULL DEFAULT 0,
  "final_amount"             numeric(12,2),
  "total_sales"              numeric(12,2),
  "status"                   text          NOT NULL DEFAULT 'open',
  "account_payments_cash"    numeric(12,2) NOT NULL DEFAULT 0,
  "account_payments_transfer" numeric(12,2) NOT NULL DEFAULT 0
);
--> statement-breakpoint

-- Para instancias que ya tenían la tabla sin estas columnas
ALTER TABLE "cash_register_sessions"
  ADD COLUMN IF NOT EXISTS "account_payments_cash"     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "account_payments_transfer" numeric(12,2) NOT NULL DEFAULT 0;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cash_register_sessions_tenant_id_idx"
  ON "cash_register_sessions" ("tenant_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "cash_sessions_one_open_per_user"
  ON "cash_register_sessions" ("tenant_id", "user_id")
  WHERE "status" = 'open';
