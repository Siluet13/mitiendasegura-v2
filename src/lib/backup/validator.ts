import type { ProductField, CategoryField, CustomerField } from "@shared/importMapper";

export interface ValidationError {
  row: number;
  reason: string;
}

export interface ValidationResult<T> {
  valid: T[];
  errors: ValidationError[];
  skipped: number;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", ".").trim());
  return isNaN(n) ? null : n;
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase().trim();
  return s === "true" || s === "si" || s === "sí" || s === "1" || s === "yes" || s === "activo";
}

export type RawProductRow = Partial<Record<ProductField, unknown>>;
export type RawCategoryRow = Partial<Record<CategoryField, unknown>>;
export type RawCustomerRow = Partial<Record<CustomerField, unknown>>;

export interface ValidProduct {
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  codigoBarras: string | null;
  precio: string;
  costo: string;
  stock: number;
  stockMinimo: number;
  activo: boolean;
  categoria: string | null;
}

export interface ValidCategory {
  nombre: string;
}

export interface ValidCustomer {
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  observaciones: string | null;
}

export function validateProducts(rows: RawProductRow[]): ValidationResult<ValidProduct> {
  const valid: ValidProduct[] = [];
  const errors: ValidationError[] = [];
  const seenSkus = new Set<string>();
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const nombre = String(row.nombre ?? "").trim();
    if (!nombre) {
      errors.push({ row: rowNum, reason: "Nombre obligatorio" });
      continue;
    }

    const precio = toNum(row.precio);
    if (precio === null) {
      errors.push({ row: rowNum, reason: `Precio inválido: "${row.precio}"` });
      continue;
    }
    if (precio < 0) {
      errors.push({ row: rowNum, reason: "Precio no puede ser negativo" });
      continue;
    }

    const costo = toNum(row.costo) ?? 0;
    if (costo < 0) {
      errors.push({ row: rowNum, reason: "Costo no puede ser negativo" });
      continue;
    }

    const stock = toNum(row.stock);
    if (stock !== null && !Number.isInteger(stock)) {
      errors.push({ row: rowNum, reason: `Stock debe ser entero: "${row.stock}"` });
      continue;
    }

    const stockMinimo = toNum(row.stockMinimo);
    if (stockMinimo !== null && !Number.isInteger(stockMinimo)) {
      errors.push({ row: rowNum, reason: `Stock mínimo debe ser entero: "${row.stockMinimo}"` });
      continue;
    }

    const sku = row.sku ? String(row.sku).trim() || null : null;
    if (sku && seenSkus.has(sku)) {
      errors.push({ row: rowNum, reason: `SKU duplicado en el archivo: "${sku}"` });
      skipped++;
      continue;
    }
    if (sku) seenSkus.add(sku);

    valid.push({
      nombre,
      descripcion: row.descripcion ? String(row.descripcion).trim() || null : null,
      sku,
      codigoBarras: row.codigoBarras ? String(row.codigoBarras).trim() || null : null,
      precio: precio.toFixed(2),
      costo: costo.toFixed(2),
      stock: Math.round(stock ?? 0),
      stockMinimo: Math.round(stockMinimo ?? 0),
      activo: row.activo !== undefined ? toBool(row.activo) : true,
      categoria: row.categoria ? String(row.categoria).trim() || null : null,
    });
  }

  return { valid, errors, skipped };
}

export function validateCategories(rows: RawCategoryRow[]): ValidationResult<ValidCategory> {
  const valid: ValidCategory[] = [];
  const errors: ValidationError[] = [];
  const seenNames = new Set<string>();
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const nombre = String(row.nombre ?? "").trim();
    if (!nombre) {
      errors.push({ row: rowNum, reason: "Nombre obligatorio" });
      continue;
    }
    const normalized = nombre.toLowerCase();
    if (seenNames.has(normalized)) {
      skipped++;
      continue;
    }
    seenNames.add(normalized);
    valid.push({ nombre });
  }

  return { valid, errors, skipped };
}

export function validateCustomers(rows: RawCustomerRow[]): ValidationResult<ValidCustomer> {
  const valid: ValidCustomer[] = [];
  const errors: ValidationError[] = [];
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const nombre = String(row.nombre ?? "").trim();
    if (!nombre) {
      errors.push({ row: rowNum, reason: "Nombre obligatorio" });
      continue;
    }
    valid.push({
      nombre,
      telefono: row.telefono ? String(row.telefono).trim() || null : null,
      email: row.email ? String(row.email).trim() || null : null,
      direccion: row.direccion ? String(row.direccion).trim() || null : null,
      observaciones: row.observaciones ? String(row.observaciones).trim() || null : null,
    });
  }

  return { valid, errors, skipped };
}
