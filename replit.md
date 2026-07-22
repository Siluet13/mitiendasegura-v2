# Mi Tienda Segura — POS SaaS

Sistema de punto de venta (POS) y gestión de inventario para pequeños negocios.

## Estado del entorno (Replit)

- **Dependencias**: instaladas con `bun install` ✓
- **Base de datos**: Replit PostgreSQL provisionada automáticamente; `DATABASE_URL` inyectada en runtime ✓
- **Schema**: 17 tablas creadas aplicando las 6 migraciones de `migrations/` + columnas adicionales del schema (`products.initial_stock`, columnas de ventas/pagos, `cash_register_sessions`, `admin_logs`, `receipt_settings`) ✓
- **Migrations journal**: `drizzle.__drizzle_migrations` actualizado con las 6 entradas ✓
- **Servidores**: API Express (5001) + Vite dev (5000) corriendo vía workflow "Start application" ✓

## Arquitectura

- **Frontend**: React 19 + TanStack Start + TanStack Router + React Query + Tailwind CSS + Shadcn/UI
- **Backend**: Express.js (puerto 5001) — API REST separada del frontend
- **Frontend dev server**: Vite (puerto 5000) — proxy `/api` → 5001
- **Auth**: Replit Auth (OIDC con Passport.js + express-session + connect-pg-simple)
- **DB**: Replit PostgreSQL + Drizzle ORM
- **Modelo de datos**: 1 usuario = 1 negocio (owner_id = req.user.claims.sub en todos los endpoints)
- **PWA**: vite-plugin-pwa con Workbox, service worker con estrategias NetworkFirst/CacheFirst

## Comando para iniciar

```
bun server/index.ts & bunx vite dev
```

## Variables de entorno requeridas

| Variable | Descripción | Obligatoria |
|---|---|---|
| `DATABASE_URL` | URL de conexión PostgreSQL (provisionada por Replit) | Sí |
| `SESSION_SECRET` | Secreto para firmar sesiones Express | Sí |
| `REPL_ID` | ID del Repl (inyectado automáticamente por Replit) | Sí (auto) |
| `MASTER_ADMIN_ID` | `sub` del usuario admin para acceder a `/admin` | Sí (manual) |
| `ISSUER_URL` | URL del OIDC issuer (default: Replit Auth) | No |

## Estructura clave

```
server/
  index.ts           — punto de entrada Express
  db.ts              — conexión Drizzle + pg pool
  api/
    inventory.ts     — CRUD productos, categorías, clientes, ventas, movimientos
    dashboard.ts     — KPIs, alertas de stock, top productos, ventas recientes
    settings.ts      — configuración del negocio
  replit_integrations/auth/replitAuth.ts — OIDC setup

src/
  router.tsx         — QueryClient con defaultOptions (staleTime 2min, retry 1)
  routes/
    __root.tsx       — shell HTML con PWA meta tags
    _authenticated.tsx — layout con sidebar + protección de ruta
    _authenticated/
      dashboard.tsx  — dashboard ejecutivo
      sales.tsx      — POS (NO MODIFICAR)
      products.tsx   — gestión de productos
      categories.tsx — gestión de categorías
      customers.tsx  — gestión de clientes
      stock-movements.tsx
      settings.tsx
  components/
    dashboard/       — KpiCards, SalesLineChart, StockAlerts, TopProductsTable, etc.
    sales/           — PosScannerInput, LastScannedPanel
    layout/          — AppSidebar

shared/
  schema.ts          — exporta todos los modelos Drizzle
  models/
    auth.ts          — sessions, users
    inventory.ts     — categories, products, customers, sales, saleItems, stockMovements, businessSettings

public/
  icons/             — icon-192.png, icon-512.png, apple-touch-icon.png, icon.svg, etc.
  offline.html       — página offline del service worker
```

## RESTRICCIONES ABSOLUTAS

**NO MODIFICAR:**
- Flujo de ventas (`server/api/inventory.ts` — endpoint POST /api/sales)
- owner_id (aislamiento por usuario en todos los endpoints)
- Modelo 1 usuario = 1 negocio
- Autenticación (Replit Auth OIDC)
- TanStack Router structure

**NO IMPLEMENTAR TODAVÍA:**
- business_id, roles, multi-tenant, múltiples usuarios por negocio

## User preferences

- Idioma de respuesta: español (Argentina)
- Código sin comentarios innecesarios
- Análisis completo antes de cualquier cambio
- Respetar arquitectura existente; no reescribir desde cero
