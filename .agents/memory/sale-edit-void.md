---
name: Sale Edit & Void Endpoints
description: PUT /api/sales/:id y DELETE /api/sales/:id — flujo, invariantes y columnas nuevas en sales.
---

# Edición y anulación de ventas

## Columnas nuevas en sales (migradas con db:push)
- `status text NOT NULL DEFAULT 'active'` — 'active' | 'void'
- `deleted_at timestamp` — seteado en anulación
- `updated_at timestamp NOT NULL DEFAULT now()` — seteado en edición y anulación

## PUT /api/sales/:id — editar venta
Flujo dentro de db.transaction:
1. SELECT sale FOR UPDATE (lock row, filtro tenantId)
2. Validar: no void, cash session no cerrada, cliente válido
3. Revertir stock viejo: entrada + stock_movement (referenciaTipo: "sale_edit")
4. DELETE saleItems (WHERE saleId)
5. INSERT nuevos saleItems + descontar stock: salida + stock_movement (referenciaTipo: "sale_edit")
6. UPDATE sales (total, observacion, customerId, updatedAt) WHERE id+tenantId

## DELETE /api/sales/:id — anular venta (soft delete)
Flujo dentro de db.transaction:
1. SELECT sale FOR UPDATE (lock row, filtro tenantId)
2. Si status='void' → return idempotente (200 ok)
3. Validar: cash session no cerrada
4. UPDATE sales SET status='void', deletedAt=now(), updatedAt=now() WHERE id+tenantId
5. Por cada saleItem: stock += cantidad, stock_movement entrada (referenciaTipo: "sale_void")

## cash.ts — calcCurrentTotal
Actualizado para filtrar `sales.status = 'active'` además de cashSessionId.
Sin este filtro, ventas anuladas seguirían contando en el total de caja.

## Invariantes multi-tenant
- TODOS los SELECT/UPDATE dentro de la transacción filtran tenantId explícitamente
- productos, cashRegisterSessions, sales: siempre and(eq(...id), eq(...tenantId))
- FOR UPDATE en sale inicial serializa ediciones/anulaciones concurrentes

## Por qué FOR UPDATE
Sin el lock, dos peticiones simultáneas de edición pueden revertir el stock original dos veces, dejando el stock inflado. El FOR UPDATE serializa las transacciones a nivel de fila.
