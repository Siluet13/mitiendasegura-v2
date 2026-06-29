---
name: Online Sync & Conflict Detection
description: Broadcasts fixed for all mutations; HTTP 409 conflict detection via X-If-Unmodified-Since on PUT endpoints; ConflictDialog component used across all editable entities.
---

## Rule
Every mutation that changes data must call `broadcast(tenantId, ...)`. Every PUT handler must check `X-If-Unmodified-Since` header against DB `updatedAt` and return 409 if a newer version exists.

## What was fixed
- DELETE /api/categories, /api/products, /api/customers — were missing broadcast(); added.
- POST /api/stock-movements — was missing broadcast(); added (invalidates ["stock_movements", "products"]).
- PUT /api/settings — was missing broadcast(); added (uses tenantId from requireTenant).
- customers table had no `updatedAt` column — added to Drizzle schema + `db:push` applied.
- PUT /api/customers — now sets `updatedAt: new Date()`.

## Conflict detection architecture
- Server: `parseIfUnmodifiedSince(req)` reads header `X-If-Unmodified-Since` as Date.
  - If present and DB `updatedAt > clientDate` → return 409 `{ message: "Conflict" }`.
  - Applied to: PUT /api/categories/:id, PUT /api/products/:id, PUT /api/customers/:id, PUT /api/settings.
- Client: `ConflictError` class in `src/lib/api/errors.ts` (re-exported from inventory.ts and settings.ts).
  - `apiFetch` throws `ConflictError` on HTTP 409.
  - Update functions accept optional `knownUpdatedAt?: string | null` and set header when provided.
  - Force overwrite = call without `knownUpdatedAt` (no header → no check).
- UI: `ConflictDialog` in `src/components/ui/conflict-dialog.tsx`.
  - "Cancelar" → close dialog + close edit form.
  - "Continuar" → re-submit with `knownUpdatedAt = null` (force).

## Per-entity state pattern in route pages
```typescript
const [knownUpdatedAt, setKnownUpdatedAt] = useState<string | null>(null);
const [conflictPending, setConflictPending] = useState(false);
const [pendingValues, setPendingValues] = useState<FormValues | null>(null);

// openEdit: setKnownUpdatedAt(record.updatedAt)
// submit: handleSave(values, knownUpdatedAt)
// ConflictError caught → setPendingValues(values); setConflictPending(true)
// Continuar → handleSave(pendingValues, null)
```

## Settings special case
- Settings uses `knownUpdatedAtRef` (useRef) updated from `data.updated_at` in useEffect.
- On conflict, `pendingInput` (BusinessSettingsInput) is stored; "Continuar" calls `mut.mutate({ input: pendingInput, knownUpdatedAt: null })`.

**Why:** Without conflict detection, simultaneous edits from two browser tabs/devices silently overwrote each other. The 409 approach avoids extra GET requests and keeps the server authoritative.

**How to apply:** Any new editable entity (PUT endpoint) must follow the same pattern: check X-If-Unmodified-Since → 409 if stale; frontend stores `updatedAt` at edit-open time, catches ConflictError, shows ConflictDialog.
