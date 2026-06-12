---
name: POS SaaS Architecture
description: Core architecture decisions for Mi Tienda Segura — auth provider, servers, data model.
---

## Rule
Auth is Replit OIDC (Passport.js + express-session + connect-pg-simple). Supabase was fully removed in a prior session. Any instruction referencing "Supabase auth", "RLS", or "create_sale() RPC" refers to the old system — the current equivalent is `req.user.claims.sub` (owner_id) enforced in every Express handler, and the sale creation is in `server/api/inventory.ts` POST /api/sales.

**Why:** The project was migrated from Lovable/Supabase to Replit in a prior session. User instructions may still reference Supabase concepts — map them to the Replit equivalents.

**How to apply:** When the user says "don't touch Supabase auth" → don't touch Replit Auth (replitAuth.ts, express-session, isAuthenticated middleware). When they say "don't touch owner_id / RLS" → don't change the `eq(table.ownerId, ownerId)` where-clauses in every API endpoint.
