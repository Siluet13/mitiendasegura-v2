---
name: Cuenta Corriente Phase 1
description: Fiado/store-credit foundation — customer_accounts table, balance lifecycle, validation requirements
---

## Rule
`payment_method = 'account'` REQUIRES `customer_id` (enforced in both POST and PUT /api/sales at the backend, and in mutationFn of both NewSaleDialog and EditSaleDialog on the frontend).

## Table
`customer_accounts` — one row per (tenant_id, customer_id). `balance` = outstanding debt (positive = customer owes). UNIQUE on (tenant_id, customer_id). CASCADE on customer DELETE.

## Balance Lifecycle
- Sale CREATE with "account": `adjustCustomerAccountBalance(+total)` inside tx
- Sale VOID: `adjustCustomerAccountBalance(-creditAmount)` inside tx (only if was "account" with customer)
- Sale EDIT: reverse old credit, apply new credit inside same tx (handles method change + customer change)

**Why:** Denormalized balance gives O(1) reads for Phase 2 (payments) without scanning all sales.

## Helper
`adjustCustomerAccountBalance(customerId, tenantId, delta, tx)` — UPSERT with `balance + delta` via onConflictDoUpdate. Lives in server/api/inventory.ts above the route definitions.

## Migration
`migrations/0003_customer_accounts.sql` — ran manually via psql; uses IF NOT EXISTS guards.

## Phase 2 next steps (recommended)
1. `customer_payments` table to record payment events
2. GET /api/customers/:id/account to read balance + history
3. POST /api/customers/:id/payment to decrement balance
4. Frontend: account statement screen per customer
