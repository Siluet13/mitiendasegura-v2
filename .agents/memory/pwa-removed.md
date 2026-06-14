---
name: PWA Removed
description: vite-plugin-pwa was fully removed after causing stale service worker issues; do not re-add without explicit user request.
---

vite-plugin-pwa was removed entirely from the project because a stale service worker (generated when devOptions.enabled was true) persisted in browsers and served public/offline.html for all navigation, making the app appear broken even though the server was running fine.

**What was removed:**
- vite-plugin-pwa package (bun remove vite-plugin-pwa)
- VitePWA import and plugin config from vite.config.ts
- public/offline.html
- dev-dist/ directory (sw.js, registerSW.js, workbox-*.js)
- manifest.webmanifest link from __root.tsx

**What remains:**
- public/icons/ — icon files still present (used for favicon/apple-touch-icon)
- The favicon and apple-touch-icon links in __root.tsx still work

**Why:** The devOptions.enabled: true setting caused the SW to intercept all navigation and serve offline.html since only 2 entries were precached. Setting enabled: false did not unregister the already-cached SW in existing browsers. The only reliable fix was full removal.

**How to apply:** Do NOT re-add vite-plugin-pwa unless the user explicitly requests PWA support and understands the SW caching implications.
