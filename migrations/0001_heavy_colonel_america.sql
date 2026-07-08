CREATE TABLE "admin_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" uuid,
	"owner_id" varchar,
	"user_id" varchar,
	"level" text DEFAULT 'info' NOT NULL,
	"module" varchar(64) NOT NULL,
	"event" varchar(128) NOT NULL,
	"message" text NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "receipt_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" varchar NOT NULL,
	"habilitado" boolean DEFAULT false NOT NULL,
	"mostrar_dialogo" boolean DEFAULT true NOT NULL,
	"impresion_automatica" boolean DEFAULT false NOT NULL,
	"descarga_automatica" boolean DEFAULT false NOT NULL,
	"tipo_comprobante" text DEFAULT 'ticket_80mm' NOT NULL,
	"prefijo_numeracion" text DEFAULT 'V' NOT NULL,
	"proximo_numero" integer DEFAULT 1 NOT NULL,
	"logo_url" text,
	"nombre_comercial" text,
	"razon_social" text,
	"cuit" text,
	"domicilio" text,
	"telefono" text,
	"email" text,
	"sitio_web" text,
	"mensaje_pie" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_register_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"initial_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"final_amount" numeric(12, 2),
	"total_sales" numeric(12, 2),
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "subscription_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "billing_cycle_start" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "billing_cycle_end" timestamp DEFAULT now() + INTERVAL '30 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "last_payment_date" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "initial_stock" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "receipt_number" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cash_session_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "admin_logs_created_at_idx" ON "admin_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_logs_owner_id_idx" ON "admin_logs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "admin_logs_tenant_id_idx" ON "admin_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "admin_logs_level_idx" ON "admin_logs" USING btree ("level");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_settings_tenant_id_idx" ON "receipt_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cash_register_sessions_tenant_id_idx" ON "cash_register_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_one_open_per_user" ON "cash_register_sessions" USING btree ("tenant_id","user_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "sales_cash_session_id_idx" ON "sales" USING btree ("cash_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_tenant_client_id_idx" ON "sales" USING btree ("tenant_id","client_id");