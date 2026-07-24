-- Historial de movimientos de cuenta corriente

CREATE TABLE IF NOT EXISTS "customer_account_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "reference_id" uuid,
  "reference_type" text,
  "amount" numeric(12,2) NOT NULL,
  "balance_after" numeric(12,2) NOT NULL,
  "observacion" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cam_tenant_id_idx"
ON "customer_account_movements" ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cam_customer_id_idx"
ON "customer_account_movements" ("customer_id");