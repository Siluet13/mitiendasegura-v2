---
name: Financial Architecture — Single Source of Truth
description: Arquitectura financiera del POS post-refactorización; funciones autorizadas, reglas de caja, y cómo extender sin romper.
---

# Financial Architecture — Single Source of Truth

## Regla fundamental
La tabla `sales` es la ÚNICA fuente de verdad financiera. Todo se deriva de ella.

## Funciones autorizadas (en server/lib/reconciliation.ts)

### calculateCashSummary(sessionId, tenantId, tx?)
- Devuelve CashSummary con: cashTotal, transferTotal, accountTotal, collectedTotal, netSales, salesCount, salesByPaymentMethod
- Usada en: GET /api/cash/current, POST /api/cash/close
- Filtra: solo status = 'active'
- COALESCE(cash_amount, total) → backward compat con ventas legadas (null = cash completo)
- COALESCE(transfer_amount, 0) → legadas = sin transferencia
- COALESCE(credit_amount, 0) → legadas = sin cta corriente

### calculateSalesSummaryForRange(tenantId, dateFilter, tx?)
- Misma fórmula que calculateCashSummary pero acepta un SQL date filter
- Usada en: todos los endpoints de /api/dashboard/* (kpis, all)
- Garantiza consistencia entre caja y dashboard (sin duplicar lógica)

### calculateCashImpact(sale)
- Calcula la porción en EFECTIVO para pre-computar cash_amount al escribir una venta
- mixed + paidAmount=null → 0 (NO defaultear a total, evita sobreconteo con transfer_amount)
- transfer/account → 0
- cash/null(legacy) → total completo

### recalculateCashSession(sessionId, tenantId, tx?)
- Internamente llama calculateCashSummary y actualiza cashRegisterSessions.totalSales
- Retorna collectedTotal (efectivo + transferencias)
- Llamar después de toda venta/edición/anulación

## Reglas de negocio de caja

```
Caja (collectedTotal) = cashTotal + transferTotal
NO incluye: accountTotal (cuenta corriente = crédito diferido)
NO incluye: ventas anuladas (status = 'void')

cashTotal     = SUM(COALESCE(cash_amount, total))  -- efectivo
transferTotal = SUM(COALESCE(transfer_amount, 0))  -- transferencias
accountTotal  = SUM(COALESCE(credit_amount, 0))    -- cta corriente
netSales      = SUM(total)                         -- ventas brutas activas
```

## Campos en cashRegisterSessions
- totalSales = collectedTotal (efectivo + transferencias), NO el total bruto

## Response shape de /api/cash/current y /api/cash/close
```json
{
  "current_total": collectedTotal,   // backward compat
  "cash_total": cashTotal,
  "transfer_total": transferTotal,
  "account_total": accountTotal,
  "net_sales": netSales,
  "sales_count": salesCount,
  "sales_by_payment_method": { cash, transfer, account, mixed }
}
```

## Response shape de /api/dashboard/kpis
```json
{
  "salesToday": netSales,   "cashToday": ..., "transferToday": ..., "accountToday": ..., "collectedToday": ...,
  "salesMonth": netSales,   "cashMonth": ..., etc.
}
```

## Prohibido
- Duplicar la lógica de calculateCashSummary en otros módulos
- Usar SUM(total) para calcular caja (ignora métodos de pago)
- Incluir ventas void en cualquier cálculo financiero
- Calcular importes financieros en el frontend

## Why
- Antes: calcCurrentTotal() en cash.ts usaba SUM(total) → todas las ventas contaban como efectivo
- Antes: dashboard no filtraba voided → KPIs inflados
- Antes: lógica de caja duplicada en 3 lugares → drift inevitable
