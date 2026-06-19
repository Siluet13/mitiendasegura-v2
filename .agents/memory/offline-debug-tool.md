---
name: Offline Debug Tool
description: /admin/offline-debug page architecture and instrumentation map.
---

## Route structure change

admin.tsx was restructured from a full-page component into a TanStack Router layout route that:
- Does the admin auth check (getAdminMe query)
- Renders <Outlet /> for child routes
- Child routes live in src/routes/admin/ directory

admin/index.tsx → path "/admin/"  (AdminPanel — business list + license management)
admin/offline-debug.tsx → path "/admin/offline-debug"  (debug tool)

## Logger (src/lib/offline/logger.ts)

- Persists to localStorage key: `mts_offline_logs`
- Max 500 entries, oldest evicted first
- Exports: `log(event, data?, level?)`, `getLogs()`, `clearLogs()`
- LogLevel: "info" | "warn" | "error" | "debug"
- 25 LogEvent types defined

## Instrumentation points

| File | Events logged |
|---|---|
| queue.ts enqueue() | ENQUEUE_START, ENQUEUE_SUCCESS, IDB_ERROR |
| sync.ts syncAllPending() | SYNC_START, SYNC_SUCCESS, SYNC_ERROR |
| sync.ts per-entity | PRODUCT/CATEGORY/CUSTOMER/SALE _CREATE_SYNCED |
| products.tsx mutationFn | PRODUCT_CREATE_START, PRODUCT_CREATE_ENQUEUED |
| categories.tsx mutationFn | CATEGORY_CREATE_START, CATEGORY_CREATE_ENQUEUED |
| customers.tsx mutationFn | CUSTOMER_CREATE_START, CUSTOMER_CREATE_ENQUEUED |
| sales.tsx mutationFn | SALE_CREATE_START, SALE_CREATE_ENQUEUED |

## Debug page sections

1. Estado general: navigator.onLine, op counts, last event timestamps
2. Cola IDB: ALL ops (not just pending), expandable payload, auto-refresh every 3s
3. Event log: last 500 entries from localStorage, expandable data, clear button
4. Export: downloads JSON with ops + logs + navigator.onLine + timestamp
5. Auto-test: enqueues 4 test ops directly via enqueue(), verifies in IDB

**Why**: The admin layout + child routes pattern is the correct TanStack Router approach for admin sub-pages. Do NOT make admin/index.tsx use createFileRoute("/admin") — it must be "/admin/" (trailing slash for index within layout).
