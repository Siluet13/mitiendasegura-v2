ALTER TABLE "sales" ADD COLUMN "client_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "sales_tenant_client_id_idx" ON "sales" ("tenant_id","client_id") WHERE "client_id" IS NOT NULL;
