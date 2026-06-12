---
name: Dashboard N+1 Fix
description: Two performance bugs fixed in server/api/dashboard.ts — N+1 on recent-sales and full-table JS aggregation on top-products.
---

## Rule
`/api/dashboard/recent-sales` previously ran a separate COUNT query per sale (N+1). Fixed with a single LEFT JOIN + GROUP BY + COUNT. `/api/dashboard/top-products` previously fetched all sale_items rows and aggregated in Node.js. Fixed with SQL GROUP BY + SUM.

A new consolidated endpoint `/api/dashboard/all` was added — returns all dashboard data in one DB round-trip using Promise.all of 8 parallel queries.

**Why:** Dashboard was making 10+ DB queries for just the recent-sales list. With many sales this would be slow. SQL-level aggregation is always faster than fetching rows and reducing in JS.

**How to apply:** If adding new dashboard widgets, use SQL aggregation (GROUP BY, SUM, COUNT) rather than fetching raw rows. Use the /api/dashboard/all pattern if adding more widgets to avoid extra round-trips.
