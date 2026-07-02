---
name: Billing React Query Keys
description: Cache keys para datos de billing/settings — deben ser consistentes entre hooks y componentes.
---

# Query keys de billing

## La regla
Todos los componentes/hooks que leen `business_settings` deben usar la misma cache key para que las invalidaciones propaguen correctamente.

| Hook/Componente | queryKey correcto |
|---|---|
| `src/hooks/useBilling.ts` | `["business_settings"]` |
| `src/routes/_authenticated/settings.tsx` | `["business_settings"]` |
| `src/hooks/useLicense.ts` | `["/api/license/status"]` |

## Por qué
Si `useBilling` usara `["settings"]` y `settings.tsx` invalida `["business_settings"]`, el BillingBanner nunca se actualiza después de guardar configuración o registrar un pago.

## Fix aplicado (Jul 2026)
`src/hooks/useBilling.ts` line 8: `queryKey: ["settings"]` → `queryKey: ["business_settings"]`
