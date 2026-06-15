---
name: SaaS Foundation
description: Multi-tenant structural base added without breaking existing single-tenant functionality.
---

# SaaS Foundation

## What was added

- `shared/models/tenants.ts` — new file with `tenants` table (id, name, owner_id, created_at) and `profiles` table (id = auth user id, tenant_id nullable, role enum: owner|admin|user).
- `shared/schema.ts` — exports `./models/tenants` between auth and inventory.
- `shared/models/inventory.ts` — nullable `tenant_id uuid` column added to: categories, products, customers, sales, stockMovements. NOT added to saleItems (redundant via sale) or businessSettings (1:1 with owner).
- `server/lib/context.ts` — `getCurrentUserId(req)` and `getCurrentTenantId(req)` helpers; currently both return `req.user.claims.sub`; future RBAC phase should derive tenantId from profile lookup.

## Rules

**Why:** Avoids scattered `req.user.claims.sub` access across every API file; prepares schema for multi-tenant isolation without breaking any existing queries (tenant_id is nullable, existing rows simply have NULL).

**How to apply:**
- When adding new API routes, import from `server/lib/context.ts` instead of accessing `req.user.claims.sub` directly.
- When the real multi-tenant phase starts: populate tenant_id in new rows + add NOT NULL constraint + index on tenant_id.
- Do NOT query by tenant_id yet — all existing queries filter by owner_id which remains the active isolation mechanism.
