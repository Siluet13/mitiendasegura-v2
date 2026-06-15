---
name: SaaS Foundation
description: Multi-tenant architecture — schema, middleware, auth, and all business routes. tenant_id is now the sole isolation key.
---

# SaaS Foundation

## Estado actual (FINAL — SaaS Strict Mode)

### Schema
- `shared/models/tenants.ts` — `tenants` (id uuid, name, owner_id, created_at) + `profiles` (id = auth user id varchar, tenant_id uuid nullable, role enum: owner|admin|user).
- `shared/models/inventory.ts` — nullable `tenant_id uuid` on: categories, products, customers, sales, stockMovements. NOT on saleItems (redundant) or businessSettings (1:1 with owner_id).

### Auth / lazy creation
- `server/replit_integrations/auth/storage.ts` — `upsertUser` calls `ensureProfileAndTenant()` on every login; creates tenant + profile lazily if missing; idempotent.
- After login, every user is guaranteed to have `profiles.tenant_id` set to a valid UUID.

### Tenant resolution middleware
- `server/middleware/tenant.ts` — `resolveTenant` runs after Passport on every authenticated request.
  - Queries `profiles.tenantId` for the logged-in user.
  - Attaches result to `req.tenantId` (UUID string or `null` if profile not found).
  - Fallback is `null` — NEVER falls back to userId string (would corrupt UUID columns).
- `server/index.ts` — `app.use(resolveTenant)` registered immediately after `setupAuth`.

### Context helpers
- `server/lib/context.ts` — exports:
  - `getCurrentUserId(req)` → string
  - `getCurrentTenantId(req)` → string | null
  - `requireTenant(req)` → `{ userId, tenantId }` (tenantId can be null; routes guard themselves)

### Business routes — STRICT tenant_id mode
All routes pattern:
```ts
const { userId, tenantId } = requireTenant(req);
if (!tenantId) return res.status(500).json({ message: "Tenant no configurado..." });
// All WHERE: eq(table.tenantId, tenantId)
// All INSERT: { ownerId: userId, tenantId, ...fields }
```

- `server/api/inventory.ts` — categories, products, customers, sales, stock_movements. POST /api/sales logic preserved exactly.
- `server/api/dashboard.ts` — all KPI/chart/alert endpoints + /api/dashboard/all.
- `server/api/settings.ts` — uses `userId` only (businessSettings has no tenant_id column — 1:1 with owner).
- `server/api/backup.ts` — export by tenantId; restore deletes by tenantId; writes include tenantId.
- `server/api/admin.ts` — NOT modified; no tenant filter (global admin view by design).

### Isolation model (FINAL)
- **READ**: `WHERE tenant_id = tenantId` — strict, no fallbacks, no OR conditions.
- **WRITE (INSERT)**: always `{ ownerId: userId, tenantId }` on every row.
- **WRITE (UPDATE)**: filter by `AND(eq(id, param), eq(tenantId, tenantId))`.
- **owner_id**: retained as audit/legacy field, never used as a data isolation filter in business routes.

### Database state
- DB was empty when strict mode was activated — no backfill needed; zero legacy rows.
- All future rows will have tenant_id set from day 1.

## Rules for new routes

**How to apply:**
1. `const { userId, tenantId } = requireTenant(req);`
2. `if (!tenantId) return res.status(500).json({ message: "Tenant no configurado..." });`
3. WHERE: `eq(table.tenantId, tenantId)` (compound: `and(eq(table.id, id), eq(table.tenantId, tenantId))`)
4. INSERT values: `{ ownerId: userId, tenantId, ...fields }`
5. Admin routes: skip tenant filter (global view, no `if (!tenantId)` guard needed).

**Why strict mode (not dual filter):** DB was empty at activation point. No legacy rows. Dual filter (OR conditions) added unnecessary complexity and a potential data-leakage surface if tenantId ever resolved incorrectly.

## Ready for next phases
- Billing: tenant is the unit of subscription — `tenants.id` is the foreign key.
- RBAC: `profiles.role` already exists (owner | admin | user).
- Multi-empresa: add `tenant_members` table + invite flow without touching existing isolation logic.
- Panel maestro: query across all tenants using admin routes (already unguarded).
