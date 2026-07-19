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
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cam_tenant_id_idx" ON "customer_account_movements" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cam_customer_id_idx" ON "customer_account_movements" ("customer_id");--> statement-breakpoint

-- Backfill: registrar ventas fiadas existentes como movimientos
-- Usa window function para computing running balance por cliente
INSERT INTO "customer_account_movements" (
  id, tenant_id, customer_id, type,
  reference_id, reference_type, amount, balance_after, observacion, created_at
)
SELECT
  gen_random_uuid(),
  s.tenant_id,
  s.customer_id,
  'sale',
  s.id,
  'sale',
  s.credit_amount,
  SUM(CAST(s.credit_amount AS numeric)) OVER (
    PARTITION BY s.tenant_id, s.customer_id
    ORDER BY s.created_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ),
  'Migración de datos',
  s.created_at
FROM sales s
WHERE s.payment_method = 'account'
  AND s.status = 'active'
  AND s.customer_id IS NOT NULL
  AND s.credit_amount IS NOT NULL
ON CONFLICT DO NOTHING;
