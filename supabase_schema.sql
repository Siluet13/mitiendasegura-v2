-- ============================================================
-- Mi Tienda Segura — Schema completo para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────
CREATE TYPE "public"."profile_role" AS ENUM('owner', 'admin', 'user');
CREATE TYPE "public"."stock_movement_type" AS ENUM('entrada', 'salida');
CREATE TYPE "public"."license_status" AS ENUM('activa', 'pendiente', 'suspendida', 'vencida');

-- ── sessions ─────────────────────────────────────────────────
CREATE TABLE "sessions" (
  "sid" varchar PRIMARY KEY NOT NULL,
  "sess" jsonb NOT NULL,
  "expire" timestamp NOT NULL
);
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");

-- ── users ────────────────────────────────────────────────────
CREATE TABLE "users" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar,
  "first_name" varchar,
  "last_name" varchar,
  "profile_image_url" varchar,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

-- ── tenants ──────────────────────────────────────────────────
CREATE TABLE "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "owner_id" varchar NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ── profiles ─────────────────────────────────────────────────
CREATE TABLE "profiles" (
  "id" varchar PRIMARY KEY NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL,
  "role" "profile_role" DEFAULT 'owner' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ── licenses ─────────────────────────────────────────────────
CREATE TABLE "licenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" varchar NOT NULL,
  "status" "license_status" DEFAULT 'pendiente' NOT NULL,
  "activated_at" timestamp,
  "expires_at" timestamp,
  "suspended_at" timestamp,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "licenses_owner_id_unique" UNIQUE("owner_id")
);

-- ── admin_logs ───────────────────────────────────────────────
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
CREATE INDEX "admin_logs_created_at_idx" ON "admin_logs" USING btree ("created_at");
CREATE INDEX "admin_logs_owner_id_idx" ON "admin_logs" USING btree ("owner_id");
CREATE INDEX "admin_logs_tenant_id_idx" ON "admin_logs" USING btree ("tenant_id");
CREATE INDEX "admin_logs_level_idx" ON "admin_logs" USING btree ("level");

-- ── business_settings ────────────────────────────────────────
CREATE TABLE "business_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" varchar NOT NULL,
  "nombre_negocio" text NOT NULL,
  "razon_social" text,
  "telefono" text,
  "email" text,
  "direccion" text,
  "ciudad" text,
  "provincia" text,
  "pais" text,
  "moneda" text DEFAULT 'ARS' NOT NULL,
  "simbolo_moneda" text DEFAULT '$' NOT NULL,
  "decimales" integer DEFAULT 2 NOT NULL,
  "logo_url" text,
  "mensaje_tickets" text,
  "observaciones" text,
  "subscription_status" text DEFAULT 'active' NOT NULL,
  "billing_cycle_start" timestamp DEFAULT now() NOT NULL,
  "billing_cycle_end" timestamp DEFAULT now() + INTERVAL '30 days' NOT NULL,
  "last_payment_date" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "business_settings_owner_id_unique" UNIQUE("owner_id")
);

-- ── categories ───────────────────────────────────────────────
CREATE TABLE "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" varchar NOT NULL,
  "tenant_id" uuid NOT NULL,
  "nombre" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "categories_tenant_id_idx" ON "categories" USING btree ("tenant_id");

-- ── customers ────────────────────────────────────────────────
CREATE TABLE "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" varchar NOT NULL,
  "tenant_id" uuid NOT NULL,
  "nombre" text NOT NULL,
  "telefono" text,
  "email" text,
  "direccion" text,
  "observaciones" text,
  "balance_due" numeric(12, 2) DEFAULT '0' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "customers_tenant_id_idx" ON "customers" USING btree ("tenant_id");

-- ── products ─────────────────────────────────────────────────
CREATE TABLE "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" varchar NOT NULL,
  "tenant_id" uuid NOT NULL,
  "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "nombre" text NOT NULL,
  "descripcion" text,
  "sku" text,
  "codigo_barras" text,
  "precio" numeric(12, 2) DEFAULT '0' NOT NULL,
  "costo" numeric(12, 2) DEFAULT '0' NOT NULL,
  "stock" integer DEFAULT 0 NOT NULL,
  "initial_stock" integer DEFAULT 0 NOT NULL,
  "stock_minimo" integer DEFAULT 0 NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "products_tenant_id_idx" ON "products" USING btree ("tenant_id");

-- ── sales ────────────────────────────────────────────────────
CREATE TABLE "sales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" varchar NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" varchar NOT NULL,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
  "client_id" text,
  "receipt_number" text,
  "total" numeric(12, 2) DEFAULT '0' NOT NULL,
  "observacion" text,
  "cash_session_id" uuid,
  "status" text DEFAULT 'active' NOT NULL,
  "payment_method" text DEFAULT 'cash' NOT NULL,
  "amount_received" numeric(12, 2),
  "change_given" numeric(12, 2),
  "customer_account" boolean DEFAULT false NOT NULL,
  "deleted_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "sales_tenant_id_idx" ON "sales" USING btree ("tenant_id");
CREATE INDEX "sales_cash_session_id_idx" ON "sales" USING btree ("cash_session_id");
CREATE UNIQUE INDEX "sales_tenant_client_id_idx" ON "sales" USING btree ("tenant_id", "client_id");

-- ── sale_items ───────────────────────────────────────────────
CREATE TABLE "sale_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sale_id" uuid NOT NULL REFERENCES "sales"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "cantidad" integer NOT NULL,
  "precio_unitario" numeric(12, 2) NOT NULL,
  "subtotal" numeric(12, 2) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ── stock_movements ──────────────────────────────────────────
CREATE TABLE "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" varchar NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" varchar NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "tipo" "stock_movement_type" NOT NULL,
  "cantidad" integer NOT NULL,
  "observacion" text,
  "referencia_tipo" text,
  "referencia_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "stock_movements_tenant_id_idx" ON "stock_movements" USING btree ("tenant_id");

-- ── receipt_settings ─────────────────────────────────────────
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
CREATE UNIQUE INDEX "receipt_settings_tenant_id_idx" ON "receipt_settings" USING btree ("tenant_id");

-- ── cash_register_sessions ───────────────────────────────────
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
CREATE INDEX "cash_register_sessions_tenant_id_idx" ON "cash_register_sessions" USING btree ("tenant_id");
CREATE UNIQUE INDEX "cash_sessions_one_open_per_user" ON "cash_register_sessions" USING btree ("tenant_id", "user_id") WHERE status = 'open';
