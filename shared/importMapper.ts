export type ProductField = "nombre" | "descripcion" | "sku" | "codigoBarras" | "precio" | "costo" | "stock" | "stockMinimo" | "activo" | "categoria";
export type CategoryField = "nombre";
export type CustomerField = "nombre" | "telefono" | "email" | "direccion" | "observaciones";
export type EntityField = ProductField | CategoryField | CustomerField;

export const ENTITY_TYPES = ["products", "categories", "customers"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export const PRODUCT_ALIASES: Record<string, ProductField> = {
  nombre: "nombre", producto: "nombre", articulo: "nombre", product: "nombre", name: "nombre", item: "nombre", descripcionbreve: "nombre",
  descripcion: "descripcion", description: "descripcion", detalle: "descripcion", detail: "descripcion",
  sku: "sku", codigo: "sku", code: "sku", referencia: "sku", ref: "sku", codigointerno: "sku",
  codigobarras: "codigoBarras", codigodebarras: "codigoBarras", ean: "codigoBarras", barcode: "codigoBarras", upc: "codigoBarras", gtin: "codigoBarras", ean13: "codigoBarras", codbarras: "codigoBarras",
  precio: "precio", precioventa: "precio", preciopublico: "precio", price: "precio", pvp: "precio", pv: "precio", preciodeventa: "precio", preciounitario: "precio",
  costo: "costo", preciocompra: "costo", cost: "costo", preciodecosto: "costo", preciocosto: "costo",
  stock: "stock", stockactual: "stock", existencia: "stock", existencias: "stock", quantity: "stock", qty: "stock", cant: "stock", cantidad: "stock",
  stockminimo: "stockMinimo", stockmin: "stockMinimo", minstock: "stockMinimo", cantminima: "stockMinimo",
  activo: "activo", active: "activo", habilitado: "activo", enabled: "activo", estado: "activo", disponible: "activo",
  categoria: "categoria", category: "categoria", rubro: "categoria", tipo: "categoria", grupo: "categoria",
};

export const CATEGORY_ALIASES: Record<string, CategoryField> = {
  nombre: "nombre", categoria: "nombre", category: "nombre", name: "nombre", rubro: "nombre", tipo: "nombre",
};

export const CUSTOMER_ALIASES: Record<string, CustomerField> = {
  nombre: "nombre", cliente: "nombre", customer: "nombre", name: "nombre", razonsocial: "nombre", razon: "nombre",
  telefono: "telefono", phone: "telefono", tel: "telefono", celular: "telefono", movil: "telefono", fono: "telefono", whatsapp: "telefono",
  email: "email", mail: "email", correo: "email", correoelectronico: "email",
  direccion: "direccion", address: "direccion", domicilio: "direccion", dir: "direccion", calle: "direccion",
  observaciones: "observaciones", notas: "observaciones", notes: "observaciones", comentarios: "observaciones",
};

export const ALIASES_BY_ENTITY: Record<EntityType, Record<string, EntityField>> = {
  products: PRODUCT_ALIASES,
  categories: CATEGORY_ALIASES,
  customers: CUSTOMER_ALIASES,
};

export interface MappingResult<T extends string> {
  mapped: Map<string, T>;
  unmapped: string[];
  detected: T[];
}

export function mapColumns<T extends string>(
  headers: string[],
  aliases: Record<string, T>
): MappingResult<T> {
  const mapped = new Map<string, T>();
  const unmapped: string[] = [];
  const seen = new Set<T>();

  for (const header of headers) {
    const key = normalizeHeader(header);
    const field = aliases[key] as T | undefined;
    if (field !== undefined && !seen.has(field)) {
      mapped.set(header, field);
      seen.add(field);
    } else if (field === undefined) {
      unmapped.push(header);
    }
  }

  return { mapped, unmapped, detected: [...seen] };
}

export function applyMapping<T extends string>(
  rows: Record<string, unknown>[],
  mapped: Map<string, T>,
  extraMaps?: Map<string, T>
): Record<T, unknown>[] {
  const allMaps = extraMaps ? new Map([...mapped, ...extraMaps]) : mapped;
  return rows.map((row) => {
    const result: Partial<Record<T, unknown>> = {};
    for (const [header, field] of allMaps.entries()) {
      if (header in row) result[field] = row[header];
    }
    return result as Record<T, unknown>;
  });
}

export function detectEntityType(headers: string[]): EntityType {
  const scores: Record<EntityType, number> = { products: 0, categories: 0, customers: 0 };
  for (const h of headers) {
    const key = normalizeHeader(h);
    if (PRODUCT_ALIASES[key]) scores.products++;
    if (CATEGORY_ALIASES[key]) scores.categories++;
    if (CUSTOMER_ALIASES[key]) scores.customers++;
  }
  if (scores.products >= scores.customers && scores.products >= scores.categories) return "products";
  if (scores.customers >= scores.categories) return "customers";
  return "categories";
}

export const TEMPLATE_HEADERS: Record<EntityType, string[]> = {
  products: ["Nombre", "Descripción", "SKU", "Código Barras", "Precio", "Costo", "Stock", "Stock Mínimo", "Activo", "Categoría"],
  categories: ["Nombre"],
  customers: ["Nombre", "Teléfono", "Email", "Dirección", "Observaciones"],
};

export const TEMPLATE_EXAMPLES: Record<EntityType, Record<string, unknown>> = {
  products: { "Nombre": "Ejemplo Producto", "Descripción": "Descripción del producto", "SKU": "SKU-001", "Código Barras": "7790001234567", "Precio": "1500.00", "Costo": "900.00", "Stock": "10", "Stock Mínimo": "2", "Activo": "SI", "Categoría": "General" },
  categories: { "Nombre": "Ejemplo Categoría" },
  customers: { "Nombre": "Juan Pérez", "Teléfono": "11-1234-5678", "Email": "juan@ejemplo.com", "Dirección": "Av. Corrientes 1234", "Observaciones": "" },
};
