---
name: Cash Register Bug — calcCurrentTotal
description: Root cause of all sales appearing as cash in the register; fix applied; dashboard KPIs still pending.
---

# Cash Register Bug — calcCurrentTotal

## The Bug
`server/api/cash.ts`, function `calcCurrentTotal` (lines 12–18 before fix) used `SUM(sales.total)` — no payment method filtering.

This fed `GET /api/cash/current` → `current_total` field → used on every cash-register display in `sales.tsx`.

## The Fix (applied)
Changed to `SUM(COALESCE(sales.cash_amount, sales.total))` — same formula used by `recalculateCashSession`.

**Why:** `cash_amount` is pre-computed at sale creation by `calculateCashImpact()`. COALESCE handles legacy sales (null = treated as full cash).

## What was already correct
- `recalculateCashSession` in reconciliation.ts already used COALESCE — updates `session.totalSales` in DB correctly.
- `POST /close` used `recalculateCashSession` result, so closed-session totals were correct.
- The `total_sales` field (from DB column) is correct; only `current_total` (live polling) was wrong.

## Pending (BLOQUE 4)
Dashboard KPIs (`server/api/dashboard.ts`):
- `salesToday` and `salesMonth` use raw `SUM(total)` without filtering `status='active'` → includes voided sales.
- Decide if dashboard shows "total revenue" (all payment methods) or "cash collected" — then apply appropriate filter.
