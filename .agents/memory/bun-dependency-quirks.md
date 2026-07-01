---
name: Bun dependency quirks for this project
description: Known Bun compatibility issues with openid-client, jose, memoizee, and tanstack router-plugin versions
---

# Bun Dependency Quirks

## jose version must be v5, not v6
`openid-client@6.x` imports `jose/jwe/compact/decrypt` (a v4/v5 subpath), but declares `"jose": "^6.2.2"` in its dependencies. jose v6 dropped that subpath structure. Fix: pin `jose@5`.

**Why:** openid-client v6.8.4 has a bug — its runtime code uses jose v5 subpath API but its package.json requests v6.

**How to apply:** After any `bun install`, confirm jose is v5: `cat node_modules/jose/package.json | grep version`.

## es5-ext missing string/#/contains
`memoizee` → `d` → `es5-ext/string/#/contains` — that file is missing from the installed es5-ext package. Bun doesn't auto-create it. Fix: manually create `node_modules/es5-ext/string/#/contains.js` with a simple `indexOf !== -1` implementation.

**Why:** Incomplete package from npm registry or Bun cache stripping.

**How to apply:** After `bun install`, check `ls node_modules/es5-ext/string/\#/ | grep contains`. If missing, create the file.

## @tanstack/router-plugin must match react-router version
The project uses `@tanstack/react-router@1.168.25` but `@tanstack/router-plugin` was at `1.167.28` — it was missing the `code-splitter` directory. Fix: `bun add @tanstack/router-plugin@latest` (resolves to 1.168.18 which has the directory).

**Why:** Version mismatch between router-plugin and react-router causes missing internal files.
