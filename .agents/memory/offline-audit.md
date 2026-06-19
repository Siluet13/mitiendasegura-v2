---
name: Offline System Audit
description: Root causes and fixes for the 6 offline/PWA bugs found in the June 2026 audit.
---

## Bugs found and fixed

1. **No React Query cache persistence** (CRITICAL)
   - `src/router.tsx` created a plain `QueryClient` with no hydrate/persist.
   - Fix: `src/lib/offline/queryPersistence.ts` — `dehydrate`/`hydrate` with localStorage key `mts_rq_cache_v1`. Only persists `["products"]`, `["categories"]`, `["customers"]`. Debounced 500ms writes. Called from `getRouter()` client-side only.
   - `gcTime` raised to 24h in `QueryClient` defaults to prevent mid-session gc.

2. **SW skipWaiting only on message** (HIGH)
   - `public/sw.js` only called `skipWaiting()` on `SKIP_WAITING` message. New SW would wait indefinitely.
   - Fix: Added `self.skipWaiting()` at top of install handler (before `event.waitUntil`). Also bumped CACHE_VERSION v4→v5.
   - `Promise.all` → `Promise.allSettled` in install so one failed fetch doesn't abort the rest.

3. **Sync loop not resilient** (HIGH)
   - `updateStatus()` in `catch` block of sync loop could throw (IDB error) → broke `for...of` → remaining ops skipped.
   - Fix: Introduced `safeUpdateStatus()` in `sync.ts` that swallows IDB errors internally. All catch blocks use it.
   - Also changed `Promise.all` → `Promise.allSettled` in `syncAllPending` so one failing entity type doesn't abort others.

4. **`idbRequest` no abort handler** (HIGH)
   - If IDB transaction aborted externally, neither `onsuccess` nor `onerror` fired → Promise hung → infinite spinner.
   - Fix: Added `req.transaction?.onabort` in `queue.ts` `idbRequest()` to reject with `DOMException("AbortError")`.
   - Also added `putReq.onerror` handler in `updateStatus` for the `st.put(updated)` call.

5. **Write mutation timeout too long** (MEDIUM)
   - Default 5000ms timeout meant 5s spinner when offline with `navigator.onLine=true`.
   - Fix: `createProduct`, `createCategory`, `createCustomer`, `createSale` all use `timeoutMs: 3000`.

6. **`gcTime` default 5 minutes** (MEDIUM)
   - Data gc'd from memory after 5min of component unmount → offline mid-session showed empty lists.
   - Fix: `gcTime: 1000 * 60 * 60 * 24` globally in QueryClient.

**Why**: Auth (`useAuth`) and License (`useLicense`) already had localStorage fallbacks. Persistence was NOT needed for those. Do NOT add `["sales"]`, `["dashboard"]`, `["/api/auth/user"]`, `["/api/license/status"]` to PERSISTED_KEYS — they must stay fresh or have dedicated fallbacks.
