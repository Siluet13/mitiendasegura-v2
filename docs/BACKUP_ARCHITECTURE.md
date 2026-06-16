# Arquitectura de Backup — Mi Tienda Segura

## Qué contiene el backup

Un archivo JSON con el estado completo del tenant al momento de la exportación:

| Campo | Descripción |
|---|---|
| `version` | Versión del formato de backup (actualmente `"1.0"`) |
| `app` | Nombre de la aplicación |
| `exportedAt` | Timestamp ISO 8601 de la exportación |
| `ownerId` | ID del usuario propietario |
| `tenantId` | UUID del tenant |
| `data.businessSettings` | Configuración del negocio |
| `data.categories` | Categorías de productos |
| `data.products` | Productos e inventario |
| `data.customers` | Clientes |
| `data.sales` | Ventas |
| `data.saleItems` | Ítems de cada venta |
| `data.stockMovements` | Movimientos de stock |
| `data.license` | Licencia SaaS del tenant (opcional — puede ser null) |
| `stats` | Conteos por entidad para verificación rápida |

## Qué NO contiene el backup

- Datos de otros tenants
- Tokens de sesión o credenciales de autenticación
- Logs de sistema
- Configuración de infraestructura

## Flujo de exportación

```
GET /api/backup/export
  └── isAuthenticated + requireTenant
  └── Query paralela: businessSettings + categories + products + customers + sales + license
  └── Query secuencial: saleItems (depende de saleIds) + stockMovements
  └── Arma payload { version, app, exportedAt, ownerId, tenantId, data, stats }
  └── Descarga como backup_YYYY-MM-DD.json
```

El frontend registra el historial de exportaciones en `localStorage` (clave `mts_backup_history`, últimas 10 entradas con fecha, nombre y tamaño del archivo).

## Flujo de restauración

```
POST /api/backup/restore  { ...payload, confirmRestore: true }
  └── isAuthenticated + requireTenant
  └── Verifica confirmRestore === true  →  400 si falta
  └── Valida version + data             →  400 si inválido
  └── Valida exportedAt (fecha)         →  400 si inválida
  └── Valida arrays esperados           →  400 si estructura incorrecta
  └── Valida backup vacío               →  400 si no hay datos
  └── Verifica totalRows ≤ 100.000      →  400 si excede
  └── Transacción atómica:
        DELETE stock_movements, sale_items, sales, products, customers, categories, businessSettings
        INSERT fresh data (forzando ownerId + tenantId del usuario autenticado)
        UPSERT license (INSERT ... ON CONFLICT owner_id DO UPDATE)
  └── Responde { ok: true, stats }
```

El frontend exige **doble checkbox** antes de habilitar el botón de restaurar.

## Compatibilidad hacia atrás

| Campo en backup | Comportamiento si falta |
|---|---|
| `data.license` | Se omite la restauración de licencia (no falla) |
| `app` | Opcional en la UI, no afecta la restauración |
| `tenantId` | Opcional en el tipo; el restore usa siempre el tenant autenticado |
| `stats` | No afecta la restauración, solo se muestra en UI |

Los backups generados antes de la inclusión de `license` siguen siendo restaurables sin cambios.

## Límites y validaciones

| Límite | Valor | Dónde se aplica |
|---|---|---|
| Tamaño máximo de archivo | 50 MB | Frontend (`parseBackupFile`) |
| Total de registros en restore | 100.000 | Backend (`/api/backup/restore`) |
| Historial local de exportaciones | 10 entradas | Frontend (`localStorage`) |

## Aislamiento multi-tenant

- **Export**: todas las queries filtran por `tenantId` (o `ownerId` para `businessSettings` y `license`).
- **Restore**: todos los INSERTs fuerzan `ownerId = userId` y `tenantId = tenantId` del usuario autenticado, ignorando los valores del archivo. Un usuario no puede restaurar datos en el tenant de otro.
- **License upsert**: usa `ON CONFLICT (owner_id) DO UPDATE` → solo modifica la licencia del usuario autenticado.
