-- Índices para búsqueda eficiente de productos en ProductPicker
-- pg_trgm permite ILIKE '%q%' eficiente sobre nombres (substring)
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_nombre_trgm_idx" ON "products" USING gin("nombre" gin_trgm_ops);--> statement-breakpoint
-- btree compuesto para búsqueda exacta/prefijo de SKU y código de barras por tenant
CREATE INDEX IF NOT EXISTS "products_sku_tenant_idx" ON "products" ("tenant_id", "sku") WHERE "sku" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_barras_tenant_idx" ON "products" ("tenant_id", "codigo_barras") WHERE "codigo_barras" IS NOT NULL;--> statement-breakpoint
