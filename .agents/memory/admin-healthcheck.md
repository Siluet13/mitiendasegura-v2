---
name: Panel Maestro & Healthcheck
description: /admin route exists and works; sidebar link added; /health endpoint added for Replit Deploy.
---

**Panel Maestro (/admin):**
- Route: src/routes/admin.tsx → /admin
- Access guard: checks GET /api/admin/me → isAdmin = (user.claims.sub === MASTER_ADMIN_ID)
- MASTER_ADMIN_ID = "60287485" (hamsterdhef@gmail.com)
- Sidebar link added to AppSidebar.tsx under "Administración" group
- Non-admins who click the link see "Acceso denegado" with back button — no security issue
- /admin is NOT under _authenticated/ layout — it has its own standalone layout

**Healthcheck:**
- Added: app.get('/health', (_req, res) => res.json({ status: 'ok' })) in server/index.ts
- Registered AFTER all other routes, before app.listen()
- Required for Replit Deployments publish healthcheck

**Data state (important):**
- DB tables are empty for owner_id 60287485: 0 products, 0 customers, 0 categories, 0 sales
- Data was in Supabase and was never migrated to Replit PostgreSQL
- This is a data problem, not a code problem — the APIs work correctly
