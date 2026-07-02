---
name: Reconciliation Layer
description: Consistency and reconciliation system for sales, stock, and cash sessions — functions, wiring points, and the admin reconcile endpoint.
---

# Capa de Reconciliación — Mi Tienda Segura POS

## Fuente de verdad
1. `sales` (status = 'active' | 'void')
2. `sale_items`
3. `stock_movements`

`cash_register_sessions.totalSales` y `products.stock` son DERIVADOS — siempre recalculables.

## Funciones core (`server/lib/reconciliation.ts`)

### `recalculateCashSession(sessionId, tenantId, tx?)`
- Suma `sales.total` WHERE cashSessionId + tenantId + status='active'
- Actualiza `cashRegisterSessions.totalSales` WHERE id + tenantId
- Devuelve el total calculado
- Acepta `tx` para ejecutarse DENTRO de una transacción existente

### `recalculateStock(productId, tenantId, tx?)`
- `products.initialStock + SUM(entradas) - SUM(salidas)` — todo filtrado por tenantId
- Garantiza stock >= 0
- Actualiza `products.stock` + `updatedAt` WHERE id + tenantId
- Acepta `tx` para ejecutarse DENTRO de una transacción existente

## Wiring — recalculateCashSession se llama DENTRO de cada transacción:
- `POST /api/sales` — después de actualizar el total de la venta
- `PUT /api/sales/:id` — después de actualizar la venta editada
- `DELETE /api/sales/:id` — después de marcar void
- `POST /api/cash/close` — reescrito con db.transaction + FOR UPDATE + recalculate antes de close

## Schema change: products.initialStock
- Columna `initial_stock INTEGER NOT NULL DEFAULT 0` en products
- `POST /api/products`: setea `initialStock = body.stock ?? 0` en creación
- Para productos existentes: backfill via `POST /api/admin/reconcile`

## Admin reconcile endpoint (`POST /api/admin/reconcile`)
- Requiere autenticación; `body.tenant_id` requiere master admin
- Paso 1: backfill `initialStock` para productos donde `initialStock = 0` y baseline difiere de 0
  - `initialStock = MAX(0, current_stock - netMovements)` — cómputo retroactivo único
- Paso 2: recalcula `products.stock` para todos los productos del tenant
- Paso 3: recalcula `cashRegisterSessions.totalSales` para todas las sesiones del tenant
- Cada producto/sesión en su propia transacción (memoria acotada)
- Devuelve summary con counts de drifts corregidos
- Registra evento en admin_logs

## Reglas de idempotencia
- `recalculateCashSession`: idempotente — siempre suma desde la fuente de verdad
- `recalculateStock`: idempotente — siempre calcula desde initialStock + movements
- backfill initialStock: safe si se corre varias veces (fórmula determinista)
- El backfill puede inflar el contador `initialStockBackfilled` en corridas repetidas cuando baseline=0, pero no daña datos

## Por qué db.transaction en cash/close
Sin transaction, entre el calcCurrentTotal y el UPDATE podría entrar una nueva venta y el totalSales quedaría desactualizado. El FOR UPDATE serializa cierres concurrentes.
