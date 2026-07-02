---
name: Billing UPSERT Pattern
description: Todos los endpoints de billing deben usar UPSERT, nunca UPDATE puro — business_settings y licenses pueden no tener fila.
---

# Regla: Billing siempre UPSERT, nunca UPDATE puro

## La regla
Cualquier escritura a `business_settings` o `licenses` desde endpoints de billing/admin **debe** usar `INSERT ... ON CONFLICT DO UPDATE`, no `UPDATE ... WHERE`.

## Por qué
`business_settings` se crea solo cuando el usuario guarda Settings por primera vez.  
`licenses` se crea solo cuando el admin activa la licencia por primera vez.  
Si el usuario es nuevo y ninguna de esas acciones ocurrió, un `UPDATE` puro afecta 0 rows y devuelve 200 OK — silent failure total.

## Cómo aplicar
```typescript
// ✅ CORRECTO
await db
  .insert(businessSettings)
  .values({ ownerId, nombreNegocio: "", billingCycleStart: now, billingCycleEnd: end, subscriptionStatus: "active" })
  .onConflictDoUpdate({
    target: businessSettings.ownerId,
    set: { billingCycleStart: now, billingCycleEnd: end, subscriptionStatus: "active", updatedAt: now },
  });

// ❌ INCORRECTO — silent failure si no hay fila
await db.update(businessSettings).set({ billingCycleStart: now, ... }).where(eq(businessSettings.ownerId, userId));
```

**Importante**: el `nombreNegocio: ""` en el INSERT de fallback NO debe ir en el `set` del `onConflictDoUpdate` — así no sobrescribe el nombre real si ya existe fila.

**Importante**: en el `INSERT` del fallback, incluir TODOS los campos de negocio que deben quedar persistidos (ej: `activatedAt`, `expiresAt`, no solo los del `set`).

## Endpoints corregidos (Jul 2026)
- `POST /api/admin/billing/payment/:ownerId` — businessSettings + licenses
- `POST /api/billing/payment` — businessSettings + licenses
- `POST /api/billing/suspend` — businessSettings + licenses
- `POST /api/billing/reactivate` — businessSettings + licenses
- `PUT /api/admin/businesses/:ownerId` — businessSettings
- `PUT /api/admin/licenses/:ownerId` — businessSettings (sync subscriptionStatus)
