---
name: Invalid Redirect URI Fix
description: Vite proxy changeOrigin:true corrupts req.hostname; OIDC callbackURL must come from REPLIT_DOMAINS env var, not req.hostname
---

## The Rule
Never build the OIDC `callbackURL` from `req.hostname` in a Vite-proxied setup. Always use `REPLIT_DOMAINS` first.

## Why
When the browser accesses `https://{REPLIT_DEV_DOMAIN}/api/login`:
1. Replit's infra routes to Vite on port 5000
2. Vite proxy (`changeOrigin: true`) forwards to Express on port 5001, changing `Host: localhost:5001`
3. Vite does NOT add `X-Forwarded-Host`
4. Express `trust proxy: 1` finds no `X-Forwarded-Host` → falls back to `Host` → `req.hostname = "localhost"`
5. `callbackURL = "https://localhost/api/callback"` → Replit OIDC rejects it → "Invalid redirect URI"

**Confirmed by curl**: `redirect_uri=https%3A%2F%2Flocalhost%2Fapi%2Fcallback` was the actual value sent to Replit's OIDC server before the fix.

## How to Apply
In `server/replit_integrations/auth/replitAuth.ts`, use:

```typescript
function getAppDomain(req: any): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const first = domains.split(",")[0].trim();
    if (first) return first;
  }
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) return devDomain.trim();
  return req.hostname;
}
```

Use `getAppDomain(req)` everywhere `req.hostname` was used for OIDC (login, callback, logout).

Also add `X-Forwarded-Host` forwarding in `vite.config.ts` proxy as defense-in-depth:
```javascript
configure: (proxy) => {
  proxy.on("proxyReq", (proxyReq, req) => {
    const originalHost = req.headers["x-forwarded-host"] ?? req.headers["host"];
    if (originalHost) proxyReq.setHeader("x-forwarded-host", originalHost);
    if (!req.headers["x-forwarded-proto"]) proxyReq.setHeader("x-forwarded-proto", "https");
  });
},
```

## Portability
`REPLIT_DOMAINS` is injected automatically by Replit per-repl. On every Remix → new REPL_ID → new `REPLIT_DOMAINS` → new domain registered with OIDC automatically. No hardcoded values.
