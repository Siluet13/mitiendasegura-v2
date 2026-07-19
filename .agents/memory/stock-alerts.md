---
name: Stock Alert System
description: How the stock alert system works — no persistent table, state computed from inventory.
---

## Design: No persistent table

Stock alerts are computed in real-time from `products.stock` and `products.stockMinimo`.
The inventory is the single source of truth. No `stock_alerts` table.

## State model

`getStockState(stock, stockMinimo)` → "sin_stock" | "stock_bajo" | "normal"
- `stock <= 0` → sin_stock
- `0 < stock <= stockMinimo` (and stockMinimo > 0) → stock_bajo
- otherwise → normal

## Notification logic (evaluateStockAlerts)

`server/lib/stockAlerts.ts` — pure function, no DB, no side effects.
Only fires a notification when STATE changes (not just value changes).
Returns `StockAlertNotification | null`.

Transition table:
- normal → stock_bajo: "stock_bajo" toast
- normal → sin_stock: "sin_stock" toast
- stock_bajo → sin_stock: "sin_stock" toast
- sin_stock → stock_bajo: "stock_bajo" toast (partial recovery)
- {sin_stock | stock_bajo} → normal: "recuperado" toast

## Wire-up pattern (transactions)

For endpoints inside transactions (POST/PUT/DELETE sales):
- Declare `xyzStockAlerts: ReturnType<typeof evaluateStockAlerts>[] = []` BEFORE the try block
- Inside the tx loop, compute newStock var before the UPDATE, then push evaluateStockAlerts(...)
- After `res.json(result)`, loop: `for (const a of xyzStockAlerts) if (a) broadcastStockAlert(tenantId, a)`

For non-tx endpoints (POST /api/stock-movements):
- Call evaluateStockAlerts immediately after the update, broadcast if non-null

For DELETE /api/stock-movements (calls recalculateStock):
- Pre-read prodBefore (nombre, stock, stockMinimo) inside tx BEFORE recalculate
- Capture newStockCalc from recalculateStock return value
- Use outer variable `delMvAlert` to pass result out of tx closure

For PUT /api/products (direct stock edit):
- Pre-read oldProdForAlert before the UPDATE
- After UPDATE + res.json, evaluate and broadcast

## Broadcast protocol extension

`server/lib/events.ts` → `BroadcastPayload` union type now includes:
- `{ type: "stock_alert", kind, productId, productName, stock, stockMinimo }`

`useTenantEvents.ts` handles `type === "stock_alert"` → shows toast via sonner.
Also: when `payload.entities.includes("products")`, invalidates `["stock_alerts"]` too.

## Frontend

- `GET /api/stock-alerts` → sinStock / stockBajo / total (no extra table)
- Query key: `["stock_alerts"]` (shared between sidebar badge, dashboard card, alert center)
- Dashboard StockAlerts: uses `getStockAlerts()` from `@/lib/api/stockAlerts` (NOT dashboard.ts)
- Alert Center route: `/_authenticated/stock-alerts`
- Sidebar badge: `useStockAlertCount()` hook

**Why:** Building a separate table would create state sync issues (alerts could drift from actual stock). Computing from live inventory is always consistent and simpler.

**How to apply:** If adding expiry/lot alerts in the future, add a NEW pure evaluateXAlerts() function and wire separately. Only add a table if you want HISTORY of when alerts fired (e.g., audit log), not to track current state.
