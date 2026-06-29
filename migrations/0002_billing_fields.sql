ALTER TABLE "business_settings" ADD COLUMN IF NOT EXISTS "subscription_status" text NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN IF NOT EXISTS "billing_cycle_start" timestamp NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN IF NOT EXISTS "billing_cycle_end" timestamp NOT NULL DEFAULT (now() + INTERVAL '30 days');--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN IF NOT EXISTS "last_payment_date" timestamp;
