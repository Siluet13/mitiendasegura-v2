import {
  mapColumns,
  detectEntityType,
  PRODUCT_ALIASES,
  CATEGORY_ALIASES,
  CUSTOMER_ALIASES,
} from "@shared/importMapper";
import type { EntityType, ProductField, CategoryField, CustomerField, EntityField, MappingResult } from "@shared/importMapper";

export interface ParsedSheet {
  entityType: EntityType;
  headers: string[];
  rows: Record<string, unknown>[];
  mapping: MappingResult<EntityField>;
}

export interface ParsedFile {
  format: "xlsx" | "csv" | "json";
  sheets: ParsedSheet[];
  isOurFormat: boolean;
}

const OUR_SHEET_NAMES: Record<string, EntityType> = {
  productos: "products",
  categorias: "categories",
  "categor\u00edas": "categories",
  clientes: "customers",
};

function csvToRows(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  const sep = lines[0].includes(";") ? ";" : ",";

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === sep) { result.push(field); field = ""; }
        else field += ch;
      }
    }
    result.push(field);
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function getMapping(headers: string[], entityType: EntityType): MappingResult<EntityField> {
  if (entityType === "products") return mapColumns(headers, PRODUCT_ALIASES) as MappingResult<EntityField>;
  if (entityType === "categories") return mapColumns(headers, CATEGORY_ALIASES) as MappingResult<EntityField>;
  return mapColumns(headers, CUSTOMER_ALIASES) as MappingResult<EntityField>;
}

function headersFromRows(rows: Record<string, unknown>[]): string[] {
  return rows.length ? Object.keys(rows[0]) : [];
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "json") {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!json?.version || !json?.data) throw new Error("Archivo JSON inválido: no es un backup de Mi Tienda Segura");

    const data = json.data;
    const sheets: ParsedSheet[] = [];

    const catMap = new Map<string, string>();
    if (Array.isArray(data.categories)) {
      for (const c of data.categories) {
        if (c.id && c.nombre) catMap.set(c.id, c.nombre);
      }
    }

    if (Array.isArray(data.categories) && data.categories.length > 0) {
      const catHeaders = ["Nombre"];
      const catRows = data.categories.map((c: any) => ({ "Nombre": c.nombre ?? "" }));
      sheets.push({
        entityType: "categories",
        headers: catHeaders,
        rows: catRows,
        mapping: { mapped: new Map([["Nombre", "nombre" as CategoryField]]) as Map<string, EntityField>, unmapped: [], detected: ["nombre"] },
      });
    }

    if (Array.isArray(data.products) && data.products.length > 0) {
      const prodHeaders = ["Nombre", "Descripción", "SKU", "Código Barras", "Precio", "Costo", "Stock", "Stock Mínimo", "Activo", "Categoría"];
      const prodRows = data.products.map((p: any) => ({
        "Nombre": p.nombre ?? "",
        "Descripción": p.descripcion ?? "",
        "SKU": p.sku ?? "",
        "Código Barras": p.codigoBarras ?? "",
        "Precio": p.precio ?? "0",
        "Costo": p.costo ?? "0",
        "Stock": p.stock ?? 0,
        "Stock Mínimo": p.stockMinimo ?? 0,
        "Activo": p.activo !== false ? "SI" : "NO",
        "Categoría": catMap.get(p.categoryId ?? "") ?? "",
      }));
      sheets.push({
        entityType: "products",
        headers: prodHeaders,
        rows: prodRows,
        mapping: getMapping(prodHeaders, "products"),
      });
    }

    if (Array.isArray(data.customers) && data.customers.length > 0) {
      const custHeaders = ["Nombre", "Teléfono", "Email", "Dirección", "Observaciones"];
      const custRows = data.customers.map((c: any) => ({
        "Nombre": c.nombre ?? "",
        "Teléfono": c.telefono ?? "",
        "Email": c.email ?? "",
        "Dirección": c.direccion ?? "",
        "Observaciones": c.observaciones ?? "",
      }));
      sheets.push({
        entityType: "customers",
        headers: custHeaders,
        rows: custRows,
        mapping: getMapping(custHeaders, "customers"),
      });
    }

    if (!sheets.length) throw new Error("El archivo JSON no contiene datos para importar (categorías, productos o clientes)");
    return { format: "json", isOurFormat: true, sheets };
  }

  if (ext === "csv" || file.type === "text/csv") {
    const text = await file.text();
    const rows = csvToRows(text);
    if (!rows.length) throw new Error("El archivo CSV está vacío o no tiene datos");
    const headers = headersFromRows(rows);
    const entityType = detectEntityType(headers);
    return { format: "csv", isOurFormat: false, sheets: [{ entityType, headers, rows, mapping: getMapping(headers, entityType) }] };
  }

  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheets: ParsedSheet[] = [];
    let isOurFormat = false;

    for (const sheetName of wb.SheetNames) {
      const norm = sheetName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const entityType: EntityType | undefined = OUR_SHEET_NAMES[norm];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (!rows.length) continue;
      const headers = headersFromRows(rows);
      const detectedType = entityType ?? detectEntityType(headers);
      if (entityType) isOurFormat = true;
      sheets.push({ entityType: detectedType, headers, rows, mapping: getMapping(headers, detectedType) });
    }

    if (!sheets.length) throw new Error("No se encontraron hojas con datos en el archivo Excel");
    return { format: "xlsx", isOurFormat, sheets };
  }

  throw new Error("Formato no soportado. Usá .json, .xlsx o .csv");
}
