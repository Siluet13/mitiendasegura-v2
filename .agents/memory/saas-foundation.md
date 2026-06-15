---
name: SaaS Foundation
description: Multi-tenant structural base + dual-compatibility activation; tenant/profile lazy creation on login.
---

# SaaS Foundation

## What exists

### Schema (Phase 1 — previous session)
- `shared/models/tenants.ts` — `tenants` (id, name, owner_id, created_at) + `profiles` (id = auth user id, tenant_id nullable, role enum: owner|admin|user).
- `shared/schema.ts` — exports `./models/tenants` between auth and inventory.
- `shared/models/inventory.ts` — nullable `tenant_id uuid` on: categories, products, customers, sales, stockMovements. NOT on saleItems (redundant) or businessSettings (1:1 with owner).

### Dual-compatibility activation (Phase 2 — current session)
- `server/replit_integrations/auth/storage.ts` — `upsertUser` now calls `ensureProfileAndTenant()` after every login. Creates tenant + profile lazily if they don't exist; skips if already present. Tenant name = first+last name, or email, or "Mi Negocio".
- `server/middleware/tenant.ts` — new middleware `resolveTenant`; runs after Passport session on every request; looks up `profiles.tenantId` for authenticated users, attaches result to `req.tenantId`. Fallback to `owner_id` if no profile.
- `server/lib/context.ts` — `getCurrentTenantId(req)` now reads `req.tenantId` (set by middleware) with fallback to `req.user.claims.sub`. `getCurrentUserId(req)` unchanged.
- `server/index.ts` — `app.use(resolveTenant)` registered immediately after `setupAuth`.

## Active isolation
- **owner_id is still the only active filter** in all existing queries. tenant_id columns are nullable; existing rows have NULL.
- `req.tenantId` is available on every authenticated request but not yet used by existing routes.

## Rules

**Why:** Lazy creation ensures every user gets a tenant/profile on first login without a mass migration. The middleware keeps tenant resolution sync (one DB read per request, results attached to req) so routes stay simple.

**How to apply:**
- New routes: use `getCurrentUserId(req)` and `getCurrentTenantId(req)` from `server/lib/context.ts`.
- Next phase (enforcement): add `tenant_id = getCurrentTenantId(req)` to INSERT queries + index on tenant_id + switch queries to filter by tenant_id instead of owner_id.
- Do NOT use tenant_id for filtering yet — owner_id remains source of truth.
