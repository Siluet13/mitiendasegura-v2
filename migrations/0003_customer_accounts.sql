-- Cuenta Corriente (Fiado) — Fase 1
-- Una fila por cliente por tenant. balance acumula la deuda pendiente.
CREATE TABLE IF NOT EXISTS "customer_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "balance" numeric(12,2) NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_accounts_tenant_id_idx" ON "customer_accounts" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_accounts_tenant_customer_idx" ON "customer_accounts" ("tenant_id","customer_id");
