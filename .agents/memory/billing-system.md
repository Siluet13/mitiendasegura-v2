---
name: Billing System Complete
description: Architecture and invariants of the billing management system in the admin panel.
---

## Data model (two tables in sync)

- `licenses` table: `status` ("activa" | "pendiente" | "suspendida" | "vencida"), `activatedAt`, `expiresAt`, `suspendedAt`, `notes`
- `businessSettings` table: `subscriptionStatus` ("active" | "suspended"), `billingCycleStart`, `billingCycleEnd`, `lastPaymentDate`

**Invariant:** `daysLeftForRow()` uses `businessSettings.billingCycleEnd`, NOT `licenses.expiresAt`. Both must be kept in sync on any admin write.

## Admin endpoints (server/api/admin.ts)

| Method | Path | What it does |
|---|---|---|
| GET | /api/admin/me | isAdmin boolean |
| GET | /api/admin/businesses | list with counts + billing |
| GET | /api/admin/businesses/:ownerId | full detail (includes tenantId) |
| PUT | /api/admin/businesses/:ownerId | edit nombreNegocio + billingCycleEnd (syncs licenses.expiresAt) |
| PUT | /api/admin/licenses/:ownerId | update status/notes (syncs businessSettings.subscriptionStatus) |
| POST | /api/admin/billing/payment/:ownerId | register payment, renew 30-day cycle |

**All mutating endpoints** broadcast SSE via `broadcastToTenant(ownerId, ["settings", "business_settings"])` so the tenant's `useBilling` hook (queryKey `["settings"]`) refetches and the BillingBanner updates in real-time.

## Client API (src/lib/api/admin.ts)
- `getAdminMe()`, `listBusinesses()`, `getBusinessDetail(ownerId)`, `updateLicense(ownerId, input)`, `updateBusinessSettings(ownerId, input)`, `registerPayment(ownerId)`

## SSE broadcast pattern for admin routes
Admin routes don't have a tenant session, so they look up tenantId by ownerId:
```typescript
async function broadcastToTenant(ownerId, entities) {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.ownerId, ownerId)).limit(1);
  if (row?.id) broadcast(row.id, { type: "invalidate", entities });
}
```
Wrapped in try/catch so broadcast failures don't fail the HTTP response.

## React Query invalidation pattern
All mutations in BusinessDetailSheet invalidate both:
- `["/api/admin/businesses"]` — the list in Panel Maestro
- `["/api/admin/businesses", ownerId]` — the cached detail in the sheet

## Frontend components
- `src/routes/admin/index.tsx` — Panel Maestro: KPI cards, filterable table, clickable rows → BusinessDetailSheet, dropdown actions (quick actions without opening sheet)
- `src/components/admin/BusinessDetailSheet.tsx` — Sheet (slide-over): full detail view, edit mode for nombreNegocio + billingCycleEnd (date input), all status actions

## Editable fields from admin
- `nombreNegocio` (businessSettings)
- `billingCycleEnd` (businessSettings + licenses.expiresAt synced)

**Why:** license status changes also update businessSettings.subscriptionStatus so both tables stay consistent; billingCycleEnd changes also update licenses.expiresAt for the same reason.
