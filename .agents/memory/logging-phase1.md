---
name: Logging Infrastructure Phase 1
description: Central logEvent utility, adminLogs DB table, frontend logSyncEvent, and event wiring across all modules.
---

## DB Table

`shared/models/admin.ts` — `adminLogs` table:
- Columns: id (uuid PK), createdAt, tenantId (uuid nullable), ownerId (varchar nullable), userId (varchar nullable), level (text default 'info'), module (varchar 64), event (varchar 128), message (text), details (jsonb nullable)
- Indexes on createdAt, ownerId, tenantId, level
- db:push applied — table exists in DB

## Server utility

`server/lib/logger.ts` — `logEvent(params)`: fire-and-forget insert into adminLogs, always `.catch(() => {})`, never throws.

## Endpoint — frontend → server

`server/api/logs.ts` — `POST /api/log/event`: isAuthenticated only (NOT behind checkLicense), allowed modules: `["sync", "offline", "pwa"]`. Registered in index.ts BEFORE `app.use("/api", checkLicense)`.

## Frontend helper

`src/lib/api/logs.ts` — `logSyncEvent(event, message, level?, details?)`: POST fire-and-forget via fetch, used in sync.ts.

## Admin read endpoints

`GET /api/admin/logs` — filter by level, module; limit ≤ 500 (isAdmin).
`GET /api/admin/logs/:ownerId` — filter by ownerId + level; limit ≤ 500 (isAdmin).

## Events wired

| File | Event |
|------|-------|
| replitAuth.ts | LOGIN_SUCCESS |
| billing.ts | BILLING_ACTIVATED, BILLING_CYCLE_RENEWED, BILLING_SUSPENDED |
| cash.ts | CASH_SESSION_OPENED, CASH_SESSION_CLOSED |
| backup.ts | BACKUP_EXPORTED_JSON/XLSX/CSV, BACKUP_IMPORTED, BACKUP_RESTORED |
| admin.ts | LICENSE_STATUS_CHANGED, ADMIN_PAYMENT_REGISTERED |
| index.ts (500 handler) | HTTP_500 (level: error) |
| sync.ts (frontend) | SYNC_START, SYNC_SUCCESS, SYNC_ERROR, SYNC_UNCAUGHT_ERROR → via POST /api/log/event |

**Why:** Centralised audit trail for SaaS: supports support tickets, security audits, and admin dashboards. Fire-and-forget pattern ensures logging never breaks the main request flow.

**How to apply:** Use `logEvent({module, event, message, level?, userId?, ownerId?, tenantId?, details?})` server-side. Use `logSyncEvent(event, message, level?, details?)` from frontend (only for sync/offline/pwa modules). Never await logEvent on the critical path.
