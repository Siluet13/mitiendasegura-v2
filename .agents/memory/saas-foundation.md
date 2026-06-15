---
name: SaaS Foundation
description: Multi-tenant structural base + dual-compatibility enforcement activated across all business routes.
---

# SaaS Foundation

## What exists

### Schema (Phase 1)
- `shared/models/tenants.ts` — `tenants` (id, name, owner_id, created_at) + `profiles` (id = auth user id, tenant_id nullable, role enum: owner|admin|user).
- `shared/schema.ts` — exports `./models/tenants` between auth and inventory.
- `shared/models/inventory.ts` — nullable `tenant_id uuid` on: categories, products, customers, sales, stockMovements. NOT on saleItems (redundant) or businessSettings (1:1 with owner).

### Dual-compatibility activation (Phase 2)
- `server/replit_integrations/auth/storage.ts` — `upsertUser` calls `ensureProfileAndTenant()` on every login; creates tenant + profile lazily if missing; idempotent.
- `server/middleware/tenant.ts` — `resolveTenant` middleware runs after Passport on every request; looks up `profiles.tenantId`; attaches real UUID to `req.tenantId` (null if not found — never falls back to userId string).
- `server/lib/context.ts` — exports `getCurrentUserId(req)`, `getCurrentTenantId(req)`, `requireTenant(req)` returning `{ userId, tenantId }`.
- `server/index.ts` — `app.use(resolveTenant)` registered immediately after `setupAuth`.

### Tenant enforcement (Phase 3 — current)
- **`scopeWhere(tenantCol, ownerCol, tenantId, userId)`** — local helper in inventory.ts and dashboard.ts.
  - If `tenantId` available: `tenant_id = tenantId OR (tenant_id IS NULL AND owner_id = userId)`
  - If `tenantId` null: `owner_id = userId` (full backward compat)
- **All business routes** now use `requireTenant` instead of `req.user.claims.sub` directly:
  - `server/api/inventory.ts` — categories, products, customers, sales (POST preserved exactly), stock_movements
  - `server/api/dashboard.ts` — all KPI/chart/alert endpoints + `/api/dashboard/all`
  - `server/api/settings.ts` — uses `userId` only (businessSettings has no tenant_id column)
  - `server/api/backup.ts` — export by userId; restore writes include `tenantId`
- **Writes** (INSERT): always include `ownerId: userId, tenantId` on new rows
- **Updates** (PUT): include `tenantId: tenantId ?? undefined` for lazy backfill
- **Admin routes** (`server/api/admin.ts`, `server/api/license.ts`) — NOT changed; no tenant filter there by design

## Active isolation model
- READ: dual filter — matches rows by tenantId OR by owner_id when tenantId is NULL (covers legacy data)
- WRITE: new rows always get both `owner_id` AND `tenant_id` set
- UPDATE: lazy backfill sets `tenant_id` on existing rows when touched

## Rules

**Why:** Dual filter ensures no data loss on existing rows (tenant_id NULL) while new data is fully tenant-tagged. Over time all rows migrate naturally via usage.

**How to apply for new routes:**
1. `const { userId, tenantId } = requireTenant(req)` at the top of each handler
2. Use `scopeWhere(table.tenantId, table.ownerId, tenantId, userId)` for all WHERE clauses
3. Include `{ ownerId: userId, tenantId }` in all INSERT values
4. Include `tenantId: tenantId ?? undefined` in UPDATE sets

**Next phase:** Once all rows have tenant_id set (verify with `SELECT COUNT(*) FROM products WHERE tenant_id IS NULL`), switch to strict `WHERE tenant_id = tenantId` and drop owner_id as fallback.
