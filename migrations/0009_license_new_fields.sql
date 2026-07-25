-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 0009 — Fase 1 Billing: nuevos valores de enum + columnas en licenses
--
-- Agrega los estados necesarios para las fases futuras (demo, gracia, permanente)
-- y las columnas de soporte. No modifica ningún dato existente.
-- Todos los ADD VALUE usan IF NOT EXISTS para idempotencia.
-- ─────────────────────────────────────────────────────────────────────────────

-- En PostgreSQL 12+ ALTER TYPE ADD VALUE puede ejecutarse dentro de una
-- transacción. Los nuevos valores no son visibles hasta el COMMIT, pero
-- como no los usamos en la misma transacción no hay problema.

ALTER TYPE "public"."license_status" ADD VALUE IF NOT EXISTS 'demo';
--> statement-breakpoint
ALTER TYPE "public"."license_status" ADD VALUE IF NOT EXISTS 'gracia';
--> statement-breakpoint
ALTER TYPE "public"."license_status" ADD VALUE IF NOT EXISTS 'permanente';
--> statement-breakpoint

ALTER TABLE "licenses"
  ADD COLUMN IF NOT EXISTS "demo_ends_at"    timestamp,
  ADD COLUMN IF NOT EXISTS "grace_ends_at"   timestamp,
  ADD COLUMN IF NOT EXISTS "last_payment_at" timestamp;
