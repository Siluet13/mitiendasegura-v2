import type { Express } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import {
  categories,
  products,
  customers,
  sales,
  saleItems,
  stockMovements,
  businessSettings,
  licenses,
} from "@shared/schema";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { logEvent } from "../lib/logger";

const MAX_RESTORE_ROWS = 100_000;

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
  const [bsData, catsData, prodsData, custsData, salesData, licData] = await Promise.all([
    db.select().from(businessSettings).where(eq(businessSettings.ownerId, userId)),
    db.select().from(categories).where(eq(categories.tenantId, tenantId)),
    db.select().from(products).where(eq(products.tenantId, tenantId)),
    db.select().from(customers).where(eq(customers.tenantId, tenantId)),
    db.select().from(sales).where(eq(sales.tenantId, tenantId)),
    db.select().from(licenses).where(eq(licenses.ownerId, userId)),
  ]);
  const saleIds = salesData.map((s) => s.id);
  const [saleItemsData, stockData] = await Promise.all([
    saleIds.length > 0
      ? db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds))
      : Promise.resolve([]),
    db.select().from(stockMovements).where(eq(stockMovements.tenantId, tenantId)),
  ]);
  return { bsData, catsData, prodsData, custsData, salesData, saleItemsData, stockData, licData };
}

export function registerBackupRoutes(app: Express): void {
  app.get("/api/backup/export", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const { bsData, catsData, prodsData, custsData, salesData, saleItemsData, stockData, licData } =
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
        sales: salesData,
        saleItems: saleItemsData,
        stockMovements: stockData,
        license: licData[0] ?? null,
      },
      stats: {
        categories: catsData.length,
        products: prodsData.length,
        customers: custsData.length,
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
        "Fecha Creación": p.createdAt.toISOString().slice(0, 10),
      }))),
      "Productos"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(catsData.map((c) => ({
        "Nombre": c.nombre,
        "ID": c.id,
        "Fecha Creación": c.createdAt.toISOString().slice(0, 10),
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
        "Fecha Creación": c.createdAt.toISOString().slice(0, 10),
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
        "Fecha": s.createdAt.toISOString().slice(0, 10),
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
        "Fecha": si.createdAt.toISOString().slice(0, 10),
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
        "Fecha": m.createdAt.toISOString().slice(0, 10),
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
        "Fecha": s.createdAt.toISOString().slice(0, 10), "ID": s.id,
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
        "Fecha": m.createdAt.toISOString().slice(0, 10),
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

    interface EntityResult { imported: number; skipped: number; errors: { row: number; reason: string }[] }
    const results: Record<string, EntityResult> = {};

    if (Array.isArray(catRows) && catRows.length > 0) {
      const result: EntityResult = { imported: 0, skipped: 0, errors: [] };
      try {
        const existingCats = await db.select({ nombre: categories.nombre }).from(categories).where(eq(categories.tenantId, tenantId));
        const existingNames = new Set(existingCats.map((c) => c.nombre.toLowerCase().trim()));

        for (let i = 0; i < catRows.length; i++) {
          const row = catRows[i] as { nombre?: string };
          const nombre = String(row.nombre ?? "").trim();
          if (!nombre) { result.errors.push({ row: i + 2, reason: "Nombre vacío" }); continue; }
          if (existingNames.has(nombre.toLowerCase())) { result.skipped++; continue; }
          try {
            await db.insert(categories).values({ ownerId: userId, tenantId, nombre });
            existingNames.add(nombre.toLowerCase());
            result.imported++;
          } catch (e: any) {
            result.errors.push({ row: i + 2, reason: e?.message ?? "Error al insertar" });
          }
        }
      } catch (e: any) {
        result.errors.push({ row: 0, reason: `Error general: ${e?.message}` });
      }
      results.categories = result;
    }

    if (Array.isArray(prodRows) && prodRows.length > 0) {
      const result: EntityResult = { imported: 0, skipped: 0, errors: [] };
      try {
        const existingProds = await db.select({ sku: products.sku }).from(products).where(eq(products.tenantId, tenantId));
        const existingSkus = new Set(existingProds.filter((p) => p.sku).map((p) => p.sku!.toLowerCase()));

        const allCats = await db.select({ id: categories.id, nombre: categories.nombre }).from(categories).where(eq(categories.tenantId, tenantId));
        const catNameToId = new Map(allCats.map((c) => [c.nombre.toLowerCase().trim(), c.id]));

        for (let i = 0; i < prodRows.length; i++) {
          const row = prodRows[i] as any;
          const sku = row.sku ? String(row.sku).trim() : null;

          if (sku && existingSkus.has(sku.toLowerCase())) { result.skipped++; continue; }

          let categoryId: string | null = null;
          if (row.categoria) {
            const catName = String(row.categoria).trim();
            const catKey = catName.toLowerCase();
            if (catNameToId.has(catKey)) {
              categoryId = catNameToId.get(catKey)!;
            } else {
              try {
                const [newCat] = await db.insert(categories).values({ ownerId: userId, tenantId, nombre: catName }).returning({ id: categories.id });
                categoryId = newCat.id;
                catNameToId.set(catKey, newCat.id);
              } catch {
                // If category creation fails, insert product without category
              }
            }
          }

          try {
            await db.insert(products).values({
              ownerId: userId,
              tenantId,
              categoryId,
              nombre: String(row.nombre).trim(),
              descripcion: row.descripcion ? String(row.descripcion).trim() || null : null,
              sku,
              codigoBarras: row.codigoBarras ? String(row.codigoBarras).trim() || null : null,
              precio: String(row.precio ?? "0"),
              costo: String(row.costo ?? "0"),
              stock: Number(row.stock ?? 0),
              stockMinimo: Number(row.stockMinimo ?? 0),
              activo: row.activo !== false && row.activo !== "NO",
            });
            if (sku) existingSkus.add(sku.toLowerCase());
            result.imported++;
          } catch (e: any) {
            result.errors.push({ row: i + 2, reason: e?.message ?? "Error al insertar producto" });
          }
        }
      } catch (e: any) {
        result.errors.push({ row: 0, reason: `Error general: ${e?.message}` });
      }
      results.products = result;
    }

    if (Array.isArray(custRows) && custRows.length > 0) {
      const result: EntityResult = { imported: 0, skipped: 0, errors: [] };
      try {
        for (let i = 0; i < custRows.length; i++) {
          const row = custRows[i] as any;
          const nombre = String(row.nombre ?? "").trim();
          if (!nombre) { result.errors.push({ row: i + 2, reason: "Nombre vacío" }); continue; }
          try {
            await db.insert(customers).values({
              ownerId: userId,
              tenantId,
              nombre,
              telefono: row.telefono ? String(row.telefono).trim() || null : null,
              email: row.email ? String(row.email).trim() || null : null,
              direccion: row.direccion ? String(row.direccion).trim() || null : null,
              observaciones: row.observaciones ? String(row.observaciones).trim() || null : null,
            });
            result.imported++;
          } catch (e: any) {
            result.errors.push({ row: i + 2, reason: e?.message ?? "Error al insertar cliente" });
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

    const totalRows =
      data.categories.length +
      data.products.length +
      data.customers.length +
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
        await tx.delete(customers).where(eq(customers.tenantId, tenantId));
        await tx.delete(categories).where(eq(categories.tenantId, tenantId));
        await tx.delete(businessSettings).where(eq(businessSettings.ownerId, userId));

        if (data.businessSettings) {
          const bs = data.businessSettings as any;
          await tx.insert(businessSettings).values({
            ...bs,
            ownerId: userId,
            billingCycleStart: toDateRequired(bs.billingCycleStart),
            billingCycleEnd: toDateRequired(bs.billingCycleEnd),
            lastPaymentDate: toDate(bs.lastPaymentDate),
            createdAt: toDateRequired(bs.createdAt),
            updatedAt: toDateRequired(bs.updatedAt),
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

        if (data.license) {
          const lic = data.license as any;
          await tx
            .insert(licenses)
            .values({
              id: lic.id,
              ownerId: userId,
              status: lic.status ?? "pendiente",
              activatedAt: toDate(lic.activatedAt),
              expiresAt: toDate(lic.expiresAt),
              suspendedAt: toDate(lic.suspendedAt),
              notes: lic.notes ?? null,
            })
            .onConflictDoUpdate({
              target: licenses.ownerId,
              set: {
                status: lic.status ?? "pendiente",
                activatedAt: toDate(lic.activatedAt),
                expiresAt: toDate(lic.expiresAt),
                suspendedAt: toDate(lic.suspendedAt),
                notes: lic.notes ?? null,
                updatedAt: new Date(),
              },
            });
        }
      });

      logEvent({ module: "backup", event: "BACKUP_RESTORED", message: "Backup restaurado completamente", userId, ownerId: userId, tenantId, details: body.stats ?? null });
      res.json({ ok: true, stats: body.stats });
    } catch (err: any) {
      console.error("Restore error:", err);
      res.status(500).json({ message: err?.message ?? "Error al restaurar el backup" });
    }
  });
}
