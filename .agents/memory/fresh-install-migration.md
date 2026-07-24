---
name: Fresh install auto-migration
description: How and why migrations run automatically at server startup instead of manually.
---

# Fresh install auto-migration

## The rule
`server/index.ts` calls `migrate(db, { migrationsFolder: './migrations' })` at the top of the async IIFE, **before** `setupAuth()`. This is the single source of truth for schema setup.

**Why:** `connect-pg-simple` (used by `setupAuth`) queries the `sessions` table in its constructor. On a fresh Replit with an empty DB, the table doesn't exist yet → `relation "sessions" does not exist`. Auto-migrating before `setupAuth` eliminates this race entirely.

**Why not drizzle-kit migrate CLI:** drizzle-kit migrate acquires a `pg_advisory_lock`. If the server's PG pool was mid-initialisation (common during crash-loop restarts), the lock would block indefinitely → hang at "applying migrations...". The programmatic `migrate()` from `drizzle-orm/node-postgres/migrator` runs inside the same process and connection pool, no advisory lock contention.

## How to apply
- Never replace `migrate()` call with a manual step in docs or CI.
- New migrations go in `migrations/` with a corresponding journal entry — the server picks them up automatically on next restart.
- `drizzle-kit push` is for local schema exploration only; never use it as the migration path.

## SSR guard (usePwaInstall)
`usePwaInstall.ts` guards all `window`/`navigator` access with `typeof window !== 'undefined'`. TanStack Start SSR renders the login page server-side; accessing `window.matchMedia` without the guard throws `ReferenceError: window is not defined` and crashes the SSR render.
