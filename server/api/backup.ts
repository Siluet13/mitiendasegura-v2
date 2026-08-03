import type { Express } from "express";
import { eq, inArray } from "drizzle-orm";

/** Normaliza un string para búsquedas: minúsculas, sin espacios extremos. */
function normalizeKey(s: string): string {
  return s.toLowerCase().trim();
}
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import {
  categories,
  products,
  customers,
  customerAccounts,
  customerAccountMovements,
  sales,
  saleItems,
  stockMovements,
  businessSettings,
} from "@shared/schema";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { logEvent } from "../lib/logger";

const MAX_RESTORE_ROWS = 100_000;

/**
 * Convierte cualquier valor de fecha (Date, string ISO, timestamp, null, undefined)
 * a una cadena ISO 8601, o devuelve "" si el valor no es una fecha válida.
 * Usar siempre en lugar de llamar .toISOString() directamente sobre campos de DB,
 * porque Drizzle puede devolver strings en lugar de objetos Date.
 */
function safeISO(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

function noTenant(res: any) {
  return res.status(500).json({ message: "Tenant no configurado. Cerrá sesión y volvé a ingresar." });
}

function toCsvString(headers: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
}

async function fetchAllData(userId: string, tenantId: string) {
  const [bsData, catsData, prodsData, custsData, salesData, caData, camData] = await Promise.all([
    db.select().from(businessSettings).where(eq(businessSettings.ownerId, userId)),
    db.select().from(categories).where(eq(categories.tenantId, tenantId)),
    db.select().from(products).where(eq(products.tenantId, tenantId)),
    db.select().from(customers).where(eq(customers.tenantId, tenantId)),
    db.select().from(sales).where(eq(sales.tenantId, tenantId)),
    db.select().from(customerAccounts).where(eq(customerAccounts.tenantId, tenantId)),
    db.select().from(customerAccountMovements).where(eq(customerAccountMovements.tenantId, tenantId)),
  ]);
  const saleIds = salesData.map((s) => s.id);
  const [saleItemsData, stockData] = await Promise.all([
    saleIds.length > 0
      ? db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds))
      : Promise.resolve([]),
    db.select().from(stockMovements).where(eq(stockMovements.tenantId, tenantId)),
  ]);
  return { bsData, catsData, prodsData, custsData, salesData, saleItemsData, stockData, caData, camData };
}

export function registerBackupRoutes(app: Express): void {
  app.get("/api/backup/export", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const { bsData, catsData, prodsData, custsData, salesData, saleItemsData, stockData, caData, camData } =
      await fetchAllData(userId, tenantId);

    const payload = {
      version: "1.0",
      app: "Mi Tienda Segura",
      exportedAt: new Date().toISOString(),
      ownerId: userId,
      tenantId,
      data: {
        businessSettings: bsData[0] ?? null,
        categories: catsData,
        products: prodsData,
        customers: custsData,
        customerAccounts: caData,
        customerAccountMovements: camData,
        sales: salesData,
        saleItems: saleItemsData,
        stockMovements: stockData,
      },
      stats: {
        categories: catsData.length,
        products: prodsData.length,
        customers: custsData.length,
        customerAccounts: caData.length,
        customerAccountMovements: camData.length,
        sales: salesData.length,
        saleItems: saleItemsData.length,
        stockMovements: stockData.length,
      },
    };

    const json = JSON.stringify(payload, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="backup_${date}.json"`);
    logEvent({ module: "backup", event: "BACKUP_EXPORTED_JSON", message: "Backup JSON exportado", userId, ownerId: userId, tenantId, details: { ...payload.stats } });
    res.send(json);
  });

  app.get("/api/backup/export/xlsx", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const { catsData, prodsData, custsData, salesData, saleItemsData, stockData } =
      await fetchAllData(userId, tenantId);

    const catMap = new Map(catsData.map((c) => [c.id, c.nombre]));
    const prodMap = new Map(prodsData.map((p) => [p.id, p.nombre]));
    const custMap = new Map(custsData.map((c) => [c.id, c.nombre]));
    const saleMap = new Map(salesData.map((s) => [s.id, s.receiptNumber ?? s.id.slice(0, 8)]));

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(prodsData.map((p) => ({
        "Nombre": p.nombre,
        "Descripción": p.descripcion ?? "",
        "SKU": p.sku ?? "",
        "Código Barras": p.codigoBarras ?? "",
        "Precio": p.precio,
        "Costo": p.costo,
        "Stock": p.stock,
        "Stock Mínimo": p.stockMinimo,
        "Activo": p.activo ? "SI" : "NO",
        "Categoría": catMap.get(p.categoryId ?? "") ?? "",
        "ID": p.id,
        "Fecha Creación": safeISO(p.createdAt).slice(0, 10),
      }))),
      "Productos"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(catsData.map((c) => ({
        "Nombre": c.nombre,
        "ID": c.id,
        "Fecha Creación": safeISO(c.createdAt).slice(0, 10),
      }))),
      "Categorías"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(custsData.map((c) => ({
        "Nombre": c.nombre,
        "Teléfono": c.telefono ?? "",
        "Email": c.email ?? "",
        "Dirección": c.direccion ?? "",
        "Observaciones": c.observaciones ?? "",
        "ID": c.id,
        "Fecha Creación": safeISO(c.createdAt).slice(0, 10),
      }))),
      "Clientes"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(salesData.map((s) => ({
        "N° Comprobante": s.receiptNumber ?? "",
        "Total": s.total,
        "Cliente": custMap.get(s.customerId ?? "") ?? "",
        "Observación": s.observacion ?? "",
        "Fecha": safeISO(s.createdAt).slice(0, 10),
        "ID": s.id,
      }))),
      "Ventas"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(saleItemsData.map((si) => ({
        "N° Comprobante": saleMap.get(si.saleId) ?? "",
        "Producto": prodMap.get(si.productId) ?? "",
        "Cantidad": si.cantidad,
        "Precio Unitario": si.precioUnitario,
        "Subtotal": si.subtotal,
        "ID Venta": si.saleId,
        "ID Producto": si.productId,
        "Fecha": safeISO(si.createdAt).slice(0, 10),
      }))),
      "Detalle de Ventas"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(stockData.map((m) => ({
        "Producto": prodMap.get(m.productId) ?? "",
        "Tipo": m.tipo,
        "Cantidad": m.cantidad,
        "Observación": m.observacion ?? "",
        "Fecha": safeISO(m.createdAt).slice(0, 10),
        "ID Producto": m.productId,
      }))),
      "Movimientos de Stock"
    );

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="backup_${date}.xlsx"`);
    logEvent({ module: "backup", event: "BACKUP_EXPORTED_XLSX", message: "Backup XLSX exportado", userId, ownerId: userId, tenantId });
    res.send(buf);
  });

  app.get("/api/backup/export/csv", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const { catsData, prodsData, custsData, salesData, saleItemsData, stockData } =
      await fetchAllData(userId, tenantId);

    const catMap = new Map(catsData.map((c) => [c.id, c.nombre]));
    const prodMap = new Map(prodsData.map((p) => [p.id, p.nombre]));
    const custMap = new Map(custsData.map((c) => [c.id, c.nombre]));
    const saleMap = new Map(salesData.map((s) => [s.id, s.receiptNumber ?? s.id.slice(0, 8)]));

    const zip = new JSZip();

    zip.file("productos.csv", toCsvString(
      ["Nombre", "Descripción", "SKU", "Código Barras", "Precio", "Costo", "Stock", "Stock Mínimo", "Activo", "Categoría", "ID"],
      prodsData.map((p) => ({
        "Nombre": p.nombre, "Descripción": p.descripcion ?? "", "SKU": p.sku ?? "",
        "Código Barras": p.codigoBarras ?? "", "Precio": p.precio, "Costo": p.costo,
        "Stock": p.stock, "Stock Mínimo": p.stockMinimo, "Activo": p.activo ? "SI" : "NO",
        "Categoría": catMap.get(p.categoryId ?? "") ?? "", "ID": p.id,
      }))
    ));

    zip.file("categorias.csv", toCsvString(
      ["Nombre", "ID"],
      catsData.map((c) => ({ "Nombre": c.nombre, "ID": c.id }))
    ));

    zip.file("clientes.csv", toCsvString(
      ["Nombre", "Teléfono", "Email", "Dirección", "Observaciones", "ID"],
      custsData.map((c) => ({
        "Nombre": c.nombre, "Teléfono": c.telefono ?? "", "Email": c.email ?? "",
        "Dirección": c.direccion ?? "", "Observaciones": c.observaciones ?? "", "ID": c.id,
      }))
    ));

    zip.file("ventas.csv", toCsvString(
      ["N° Comprobante", "Total", "Cliente", "Observación", "Fecha", "ID"],
      salesData.map((s) => ({
        "N° Comprobante": s.receiptNumber ?? "", "Total": s.total,
        "Cliente": custMap.get(s.customerId ?? "") ?? "", "Observación": s.observacion ?? "",
        "Fecha": safeISO(s.createdAt).slice(0, 10), "ID": s.id,
      }))
    ));

    zip.file("detalle_ventas.csv", toCsvString(
      ["N° Comprobante", "Producto", "Cantidad", "Precio Unitario", "Subtotal"],
      saleItemsData.map((si) => ({
        "N° Comprobante": saleMap.get(si.saleId) ?? "", "Producto": prodMap.get(si.productId) ?? "",
        "Cantidad": si.cantidad, "Precio Unitario": si.precioUnitario, "Subtotal": si.subtotal,
      }))
    ));

    zip.file("movimientos.csv", toCsvString(
      ["Producto", "Tipo", "Cantidad", "Observación", "Fecha"],
      stockData.map((m) => ({
        "Producto": prodMap.get(m.productId) ?? "", "Tipo": m.tipo,
        "Cantidad": m.cantidad, "Observación": m.observacion ?? "",
        "Fecha": safeISO(m.createdAt).slice(0, 10),
      }))
    ));

    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="backup_csv_${date}.zip"`);
    logEvent({ module: "backup", event: "BACKUP_EXPORTED_CSV", message: "Backup CSV exportado", userId, ownerId: userId, tenantId });
    res.send(buf);
  });

  app.get("/api/backup/template", isAuthenticated, async (_req, res) => {
    const wb = XLSX.utils.book_new();

    const prodHeaders = ["Nombre", "Descripción", "SKU", "Código Barras", "Precio", "Costo", "Stock", "Stock Mínimo", "Activo", "Categoría"];
    const prodExample = { "Nombre": "Ejemplo Producto", "Descripción": "Descripción opcional", "SKU": "SKU-001", "Código Barras": "7790001234567", "Precio": "1500.00", "Costo": "900.00", "Stock": "10", "Stock Mínimo": "2", "Activo": "SI", "Categoría": "General" };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([prodExample], { header: prodHeaders }), "Productos");

    const catHeaders = ["Nombre"];
    const catExample = { "Nombre": "Ejemplo Categoría" };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([catExample], { header: catHeaders }), "Categorías");

    const custHeaders = ["Nombre", "Teléfono", "Email", "Dirección", "Observaciones"];
    const custExample = { "Nombre": "Juan Pérez", "Teléfono": "11-1234-5678", "Email": "juan@ejemplo.com", "Dirección": "Av. Corrientes 1234", "Observaciones": "" };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([custExample], { header: custHeaders }), "Clientes");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="plantilla_importacion.xlsx"');
    res.send(buf);
  });

  app.post("/api/backup/import", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const { categories: catRows, products: prodRows, customers: custRows } = req.body ?? {};

    interface EntityResult { imported: number; updated: number; skipped: number; errors: { row: number; reason: string }[] }
    const results: Record<string, EntityResult> = {};

    // ── CATEGORÍAS ────────────────────────────────────────────────────────────
    // Comportamiento: reutilizar si ya existe (por nombre normalizado), crear si no.
    // Las categorías no se actualizan — solo tienen un campo (nombre).
    if (Array.isArray(catRows) && catRows.length > 0) {
      const result: EntityResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
      try {
        const existingCats = await db
          .select({ id: categories.id, nombre: categories.nombre })
          .from(categories)
          .where(eq(categories.tenantId, tenantId));
        const nameToId = new Map(existingCats.map((c) => [normalizeKey(c.nombre), c.id]));

        for (let i = 0; i < catRows.length; i++) {
          const row = catRows[i] as { nombre?: string };
          const nombre = String(row.nombre ?? "").trim();
          if (!nombre) { result.errors.push({ row: i + 2, reason: "Nombre vacío" }); continue; }
          if (nameToId.has(normalizeKey(nombre))) { result.skipped++; continue; }
          try {
            const [newCat] = await db.insert(categories).values({ ownerId: userId, tenantId, nombre }).returning({ id: categories.id });
            nameToId.set(normalizeKey(nombre), newCat.id);
            result.imported++;
          } catch (e: any) {
            result.errors.push({ row: i + 2, reason: e?.message ?? "Error al insertar categoría" });
          }
        }
      } catch (e: any) {
        result.errors.push({ row: 0, reason: `Error general: ${e?.message}` });
      }
      results.categories = result;
    }

    // ── PRODUCTOS ─────────────────────────────────────────────────────────────
    // Comportamiento UPSERT: busca por codigoBarras → sku → nombre normalizado.
    // Si existe: actualiza campos sincronizables. Si no: crea.
    // Nunca modifica: id, ownerId, tenantId, createdAt, initialStock.
    if (Array.isArray(prodRows) && prodRows.length > 0) {
      const result: EntityResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
      try {
        const existingProds = await db
          .select({ id: products.id, codigoBarras: products.codigoBarras, sku: products.sku, nombre: products.nombre })
          .from(products)
          .where(eq(products.tenantId, tenantId));

        // Tres mapas de búsqueda en orden de prioridad.
        const barcodeToId = new Map<string, string>();
        const skuToId     = new Map<string, string>();
        const nombreToId  = new Map<string, string>();
        for (const p of existingProds) {
          if (p.codigoBarras) barcodeToId.set(normalizeKey(p.codigoBarras), p.id);
          if (p.sku)          skuToId.set(normalizeKey(p.sku), p.id);
                              nombreToId.set(normalizeKey(p.nombre), p.id);
        }

        // Categorías disponibles para resolver nombre → id.
        const allCats = await db
          .select({ id: categories.id, nombre: categories.nombre })
          .from(categories)
          .where(eq(categories.tenantId, tenantId));
        const catNameToId = new Map(allCats.map((c) => [normalizeKey(c.nombre), c.id]));

        for (let i = 0; i < prodRows.length; i++) {
          const row = prodRows[i] as any;
          const nombre      = String(row.nombre ?? "").trim();
          const sku         = row.sku          ? String(row.sku).trim()          || null : null;
          const codigoBarras = row.codigoBarras ? String(row.codigoBarras).trim() || null : null;

          if (!nombre) { result.errors.push({ row: i + 2, reason: "Nombre vacío" }); continue; }

          // Buscar producto existente: barcode → sku → nombre.
          let existingId: string | undefined;
          if (codigoBarras) existingId = barcodeToId.get(normalizeKey(codigoBarras));
          if (!existingId && sku) existingId = skuToId.get(normalizeKey(sku));
          if (!existingId) existingId = nombreToId.get(normalizeKey(nombre));

          // Resolver categoría (auto-crear si no existe).
          let categoryId: string | null = null;
          if (row.categoria) {
            const catName = String(row.categoria).trim();
            const catKey  = normalizeKey(catName);
            if (catNameToId.has(catKey)) {
              categoryId = catNameToId.get(catKey)!;
            } else {
              try {
                const [newCat] = await db.insert(categories).values({ ownerId: userId, tenantId, nombre: catName }).returning({ id: categories.id });
                categoryId = newCat.id;
                catNameToId.set(catKey, newCat.id);
              } catch {
                // Categoría no pudo crearse: el producto se importa sin categoría.
              }
            }
          }

          const syncFields = {
            categoryId,
            descripcion:   row.descripcion  ? String(row.descripcion).trim()  || null : null,
            codigoBarras:  codigoBarras,
            sku:           sku,
            precio:        String(row.precio  ?? "0"),
            costo:         String(row.costo   ?? "0"),
            stock:         Number(row.stock   ?? 0),
            stockMinimo:   Number(row.stockMinimo ?? 0),
            updatedAt:     new Date(),
          };

          try {
            if (existingId) {
              // UPDATE — solo campos sincronizables. Nunca toca id, createdAt, initialStock.
              await db.update(products).set(syncFields).where(eq(products.id, existingId));
              result.updated++;
            } else {
              // INSERT — producto nuevo.
              await db.insert(products).values({
                ownerId: userId,
                tenantId,
                nombre,
                activo: row.activo !== false && row.activo !== "NO",
                ...syncFields,
                updatedAt: undefined, // dejar que el default de DB lo maneje
              });
              if (codigoBarras) barcodeToId.set(normalizeKey(codigoBarras), nombre); // evitar duplicado en misma importación
              if (sku)          skuToId.set(normalizeKey(sku), nombre);
                                nombreToId.set(normalizeKey(nombre), nombre);
              result.imported++;
            }
          } catch (e: any) {
            result.errors.push({ row: i + 2, reason: e?.message ?? "Error al procesar producto" });
          }
        }
      } catch (e: any) {
        result.errors.push({ row: 0, reason: `Error general: ${e?.message}` });
      }
      results.products = result;
    }

    // ── CLIENTES ──────────────────────────────────────────────────────────────
    // Comportamiento UPSERT: busca por email → nombre normalizado.
    // Si existe: actualiza datos de contacto. NUNCA toca customerAccounts ni movimientos.
    // Si no existe: crea.
    if (Array.isArray(custRows) && custRows.length > 0) {
      const result: EntityResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
      try {
        const existingCusts = await db
          .select({ id: customers.id, email: customers.email, nombre: customers.nombre })
          .from(customers)
          .where(eq(customers.tenantId, tenantId));

        const emailToId  = new Map<string, string>();
        const nombreToId = new Map<string, string>();
        for (const c of existingCusts) {
          if (c.email) emailToId.set(normalizeKey(c.email), c.id);
                       nombreToId.set(normalizeKey(c.nombre), c.id);
        }

        for (let i = 0; i < custRows.length; i++) {
          const row    = custRows[i] as any;
          const nombre = String(row.nombre ?? "").trim();
          const email  = row.email ? String(row.email).trim() || null : null;

          if (!nombre) { result.errors.push({ row: i + 2, reason: "Nombre vacío" }); continue; }

          // Buscar cliente existente: email → nombre.
          let existingId: string | undefined;
          if (email) existingId = emailToId.get(normalizeKey(email));
          if (!existingId) existingId = nombreToId.get(normalizeKey(nombre));

          // Campos de contacto sincronizables. Excluye todo lo financiero.
          const contactFields = {
            nombre,
            telefono:      row.telefono      ? String(row.telefono).trim()      || null : null,
            email,
            direccion:     row.direccion     ? String(row.direccion).trim()     || null : null,
            observaciones: row.observaciones ? String(row.observaciones).trim() || null : null,
            updatedAt:     new Date(),
          };

          try {
            if (existingId) {
              // UPDATE — solo contacto. customerAccounts y movimientos NO se tocan.
              await db.update(customers).set(contactFields).where(eq(customers.id, existingId));
              result.updated++;
            } else {
              // INSERT — cliente nuevo.
              await db.insert(customers).values({ ownerId: userId, tenantId, ...contactFields, updatedAt: undefined });
              if (email) emailToId.set(normalizeKey(email), nombre);
                         nombreToId.set(normalizeKey(nombre), nombre);
              result.imported++;
            }
          } catch (e: any) {
            result.errors.push({ row: i + 2, reason: e?.message ?? "Error al procesar cliente" });
          }
        }
      } catch (e: any) {
        result.errors.push({ row: 0, reason: `Error general: ${e?.message}` });
      }
      results.customers = result;
    }

    logEvent({ module: "backup", event: "BACKUP_IMPORTED", message: "Importación de datos realizada", userId, ownerId: userId, tenantId, details: { entities: Object.keys(results) } });
    res.json({ results });
  });

  app.post("/api/backup/restore", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const body = req.body;

    if (body.confirmRestore !== true) {
      return res.status(400).json({ message: "Se requiere confirmación explícita para restaurar (confirmRestore: true)." });
    }

    if (!body?.version || !body?.data) {
      return res.status(400).json({ message: "Formato de backup inválido" });
    }

    if (body.exportedAt && isNaN(Date.parse(body.exportedAt))) {
      return res.status(400).json({ message: "La fecha de exportación del backup es inválida." });
    }

    const { data } = body;

    if (
      !Array.isArray(data.categories) ||
      !Array.isArray(data.products) ||
      !Array.isArray(data.customers) ||
      !Array.isArray(data.sales) ||
      !Array.isArray(data.saleItems) ||
      !Array.isArray(data.stockMovements)
    ) {
      return res.status(400).json({ message: "Estructura de datos inválida" });
    }

    // Compatibilidad con backups anteriores: estas tablas pueden no estar presentes.
    if (!Array.isArray(data.customerAccounts))         data.customerAccounts = [];
    if (!Array.isArray(data.customerAccountMovements)) data.customerAccountMovements = [];

    const totalRows =
      data.categories.length +
      data.products.length +
      data.customers.length +
      data.customerAccounts.length +
      data.customerAccountMovements.length +
      data.sales.length +
      data.saleItems.length +
      data.stockMovements.length;

    if (totalRows === 0 && !data.businessSettings) {
      return res.status(400).json({ message: "El backup está vacío. No se realizó ninguna restauración." });
    }

    if (totalRows > MAX_RESTORE_ROWS) {
      return res.status(400).json({
        message: `El backup supera el límite de ${MAX_RESTORE_ROWS.toLocaleString("es-AR")} registros (${totalRows.toLocaleString("es-AR")} encontrados). Contactá soporte.`,
      });
    }

    // ── Validación de integridad referencial ─────────────────────────────────
    // Se ejecuta ANTES de la transacción para evitar errores SQL poco descriptivos.
    {
      const productIds  = new Set<string>((data.products  as any[]).map((p: any) => p.id).filter(Boolean));
      const customerIds = new Set<string>((data.customers as any[]).map((c: any) => c.id).filter(Boolean));

      // saleItems → products
      const orphanSaleItems = (data.saleItems as any[]).filter((si: any) => si.productId && !productIds.has(si.productId));
      if (orphanSaleItems.length > 0) {
        return res.status(400).json({
          message: `El backup contiene ${orphanSaleItems.length} ítem(s) de venta que referencian productos inexistentes. El backup puede estar dañado.`,
        });
      }

      // stockMovements → products
      const orphanStock = (data.stockMovements as any[]).filter((m: any) => m.productId && !productIds.has(m.productId));
      if (orphanStock.length > 0) {
        return res.status(400).json({
          message: `El backup contiene ${orphanStock.length} movimiento(s) de stock que referencian productos inexistentes. El backup puede estar dañado.`,
        });
      }

      // customerAccounts → customers
      const orphanAccounts = (data.customerAccounts as any[]).filter((ca: any) => ca.customerId && !customerIds.has(ca.customerId));
      if (orphanAccounts.length > 0) {
        return res.status(400).json({
          message: `El backup contiene ${orphanAccounts.length} cuenta(s) corriente que referencian clientes inexistentes. El backup puede estar dañado.`,
        });
      }

      // customerAccountMovements → customers
      const orphanMovements = (data.customerAccountMovements as any[]).filter((m: any) => m.customerId && !customerIds.has(m.customerId));
      if (orphanMovements.length > 0) {
        return res.status(400).json({
          message: `El backup contiene ${orphanMovements.length} movimiento(s) de cuenta corriente que referencian clientes inexistentes. El backup puede estar dañado.`,
        });
      }
    }

    function toDate(v: unknown): Date | null {
      if (!v) return null;
      if (v instanceof Date) return v;
      const d = new Date(v as string);
      return isNaN(d.getTime()) ? null : d;
    }

    function toDateRequired(v: unknown): Date {
      return toDate(v) ?? new Date();
    }

    try {
      await db.transaction(async (tx) => {
        // Eliminar en orden seguro respetando dependencias FK.
        await tx.delete(stockMovements).where(eq(stockMovements.tenantId, tenantId));

        const existingSales = await tx
          .select({ id: sales.id })
          .from(sales)
          .where(eq(sales.tenantId, tenantId));
        if (existingSales.length > 0) {
          await tx
            .delete(saleItems)
            .where(inArray(saleItems.saleId, existingSales.map((s) => s.id)));
        }
        await tx.delete(sales).where(eq(sales.tenantId, tenantId));
        await tx.delete(products).where(eq(products.tenantId, tenantId));
        // Eliminar cuenta corriente explícitamente antes de clientes
        // (la CASCADE de FK también lo haría, pero lo hacemos explícito).
        await tx.delete(customerAccountMovements).where(eq(customerAccountMovements.tenantId, tenantId));
        await tx.delete(customerAccounts).where(eq(customerAccounts.tenantId, tenantId));
        await tx.delete(customers).where(eq(customers.tenantId, tenantId));
        await tx.delete(categories).where(eq(categories.tenantId, tenantId));
        // Leer campos de billing ANTES de borrar para preservarlos tras el restore.
        const [existingBs] = await tx
          .select({
            subscriptionStatus: businessSettings.subscriptionStatus,
            billingCycleStart: businessSettings.billingCycleStart,
            billingCycleEnd: businessSettings.billingCycleEnd,
            lastPaymentDate: businessSettings.lastPaymentDate,
          })
          .from(businessSettings)
          .where(eq(businessSettings.ownerId, userId));

        await tx.delete(businessSettings).where(eq(businessSettings.ownerId, userId));

        if (data.businessSettings) {
          const bs = data.businessSettings as any;
          await tx.insert(businessSettings).values({
            ...bs,
            ownerId: userId,
            // Siempre sobreescribir con los valores actuales del sistema SaaS,
            // ignorando cualquier valor que venga del backup.
            subscriptionStatus: existingBs?.subscriptionStatus ?? "active",
            billingCycleStart: existingBs?.billingCycleStart ?? new Date(),
            billingCycleEnd: existingBs?.billingCycleEnd ?? new Date(),
            lastPaymentDate: existingBs?.lastPaymentDate ?? null,
            createdAt: toDateRequired(bs.createdAt),
            updatedAt: new Date(),
          });
        }

        if (data.categories.length > 0) {
          await tx.insert(categories).values(
            data.categories.map((c: any) => ({
              ...c, ownerId: userId, tenantId,
              createdAt: toDateRequired(c.createdAt),
              updatedAt: toDateRequired(c.updatedAt),
            }))
          );
        }

        if (data.products.length > 0) {
          await tx.insert(products).values(
            data.products.map((p: any) => ({
              ...p, ownerId: userId, tenantId,
              createdAt: toDateRequired(p.createdAt),
              updatedAt: toDateRequired(p.updatedAt),
            }))
          );
        }

        if (data.customers.length > 0) {
          await tx.insert(customers).values(
            data.customers.map((c: any) => ({
              ...c, ownerId: userId, tenantId,
              createdAt: toDateRequired(c.createdAt),
              updatedAt: toDateRequired(c.updatedAt),
            }))
          );
        }

        // Restaurar cuentas corrientes DESPUÉS de clientes (FK: customerId → customers.id).
        // customerAccounts no tiene ownerId ni createdAt en el schema.
        if (data.customerAccounts.length > 0) {
          await tx.insert(customerAccounts).values(
            data.customerAccounts.map((ca: any) => ({
              ...ca, tenantId,
              updatedAt: toDate(ca.updatedAt) ?? new Date(),
            }))
          );
        }

        // Restaurar movimientos de cuenta corriente DESPUÉS de customerAccounts.
        // customerAccountMovements no tiene ownerId ni updatedAt en el schema.
        if (data.customerAccountMovements.length > 0) {
          await tx.insert(customerAccountMovements).values(
            data.customerAccountMovements.map((m: any) => ({
              ...m, tenantId,
              createdAt: toDateRequired(m.createdAt),
            }))
          );
        }

        if (data.sales.length > 0) {
          await tx.insert(sales).values(
            data.sales.map((s: any) => ({
              ...s, ownerId: userId, userId, tenantId,
              createdAt: toDateRequired(s.createdAt),
            }))
          );
        }

        if (data.saleItems.length > 0) {
          await tx.insert(saleItems).values(
            data.saleItems.map((si: any) => ({
              ...si, createdAt: toDateRequired(si.createdAt),
            }))
          );
        }

        if (data.stockMovements.length > 0) {
          await tx.insert(stockMovements).values(
            data.stockMovements.map((m: any) => ({
              ...m, ownerId: userId, userId, tenantId,
              createdAt: toDateRequired(m.createdAt),
            }))
          );
        }

        // Las licencias son datos del sistema SaaS y NUNCA se restauran desde un backup.
      });

      logEvent({ module: "backup", event: "BACKUP_RESTORED", message: "Backup restaurado completamente", userId, ownerId: userId, tenantId, details: body.stats ?? null });
      res.json({ ok: true, stats: body.stats });
    } catch (err: any) {
      console.error("Restore error:", err);
      res.status(500).json({ message: err?.message ?? "Error al restaurar el backup" });
    }
  });
}
