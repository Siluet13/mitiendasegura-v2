---
name: Import/Export Backup System
description: Architecture decisions for the multi-format backup import/export system added to Mi Tienda Segura.
---

## Architecture

### Packages
- `xlsx` (SheetJS 0.18.5) — server-side Excel generation + client-side dynamic import for parsing
- `jszip` (3.10.1) — server-side ZIP creation for CSV export
- Both in `dependencies` (not devDependencies)

### Server endpoints (server/api/backup.ts)
- `GET /api/backup/export` — existing JSON (unchanged)
- `GET /api/backup/export/xlsx` — XLSX with 6 sheets (Productos, Categorías, Clientes, Ventas, Detalle, Movimientos)
- `GET /api/backup/export/csv` — ZIP with 6 CSV files (same entities)
- `GET /api/backup/template` — XLSX with 3 importable sheets + 1 example row each
- `POST /api/backup/import` — additive import; categories/products/customers; category names auto-created if missing
- `POST /api/backup/restore` — existing full-replace restore (unchanged)

**Key: express.json limit raised to 20mb** (server/index.ts) to handle large import payloads.

### Shared logic
- `shared/importMapper.ts` — column alias maps (PRODUCT_ALIASES, CATEGORY_ALIASES, CUSTOMER_ALIASES), normalizeHeader(), mapColumns(), detectEntityType(), applyMapping()
- **Why shared:** used both server-side and client-side (Vite resolves `@shared/*`)

### Client-side parsing
- `src/lib/backup/fileParser.ts` — parseFile(File) → ParsedSheet[]
  - JSON: extracts categories/products/customers from backup format, resolves categoryId→name via catMap
  - XLSX: dynamic `import("xlsx")`, multi-sheet detection by name (Productos/Categorías/Clientes), single-sheet auto-detect
  - CSV: manual RFC 4180 parser (handles both , and ; separators), single entity auto-detect
- `src/lib/backup/validator.ts` — pure validation functions: validateProducts/Categories/Customers → {valid, errors, skipped}

### UI
- `src/components/backup/ImportWizard.tsx` — self-contained wizard: idle → configuring → importing → done
  - "configuring" step shows validation inline (no separate step needed)
  - Per-sheet: detected columns (green badges), unmapped cols with Select for manual mapping
  - Auto-creates valid rows by merging autoMapped + manualMaps before sending to server
- `src/routes/_authenticated/backup.tsx` — updated with 3 export buttons, template button, ImportWizard section, existing restore section kept intact

## Import behavior (additive, NOT replace)
- Categories: skip if nombre already exists (case-insensitive)
- Products: skip if SKU already exists for tenant; auto-creates missing categories by name
- Customers: always insert (no uniqueness constraint)
- Each entity has independent try/catch → one entity failure doesn't block others

## JSON import (backup format)
- Parsed client-side: categoryId resolved to name using backup's own categories array
- Results in same ParsedSheet[] structure as xlsx/csv — no special server handling needed

**Why:** column mapper normalizeHeader() strips accents+spaces+case, handles Spanish synonyms reliably; server-side import is simpler because client sends pre-validated canonical rows.
