-- Índices para búsqueda eficiente de productos en ProductPicker
-- btree compuesto para búsqueda exacta/prefijo de SKU y código de barras por tenant
CREATE INDEX IF NOT EXISTS "products_sku_tenant_idx" ON "products" ("tenant_id", "sku") WHERE "sku" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_barras_tenant_idx" ON "products" ("tenant_id", "codigo_barras") WHERE "codigo_barras" IS NOT NULL;--> statement-breakpoint
