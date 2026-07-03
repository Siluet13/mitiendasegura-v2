---
name: Payment Methods & Cash Impact
description: Schema, backend logic, and frontend UI for multi-payment-method sales in POS.
---

# Payment Methods & Cash Impact

## Rule
Sales now have payment_method ("cash"|"transfer"|"account"|"mixed"). Cash impact on register:
- cash (or null/legacy) → full total impacts caja
- transfer → 0
- account → 0
- mixed → paidAmount (cash portion only)

**Why:** Business requirement: transfer/cuenta corriente sales don't put money in the cash register.

**How to apply:**
- `calculateCashImpact()` in `server/lib/reconciliation.ts` is the single source of truth
- `cashAmount` column in `sales` table stores the computed impact (fast aggregation)
- `recalculateCashSession` uses `COALESCE(cash_amount, total)` for backward compat with pre-feature sales
- Frontend passes payment_method + amounts to createSale/updateSale; defaults to "cash"

## Schema additions (all nullable, additive)
sales: paymentMethod, paidAmount, creditAmount, transferAmount, cashAmount
stockMovements: voidedAt, voidedBy, voidReason (soft delete)

## Stock movement soft delete
- Only manual movements can be voided (blocks sale/sale_edit referenciaTipo)
- `recalculateStock` filters `isNull(stockMovements.voidedAt)` in both entradas and salidas
- DELETE /api/stock-movements/:id endpoint added
