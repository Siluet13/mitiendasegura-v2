import type { Express } from "express";
import { eq, and, or, isNull, desc, sql } from "drizzle-orm";
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
} from "@shared/schema";

function scopeWhere(
  tenantCol: any,
  ownerCol: any,
  tenantId: string | null,
  userId: string,
) {
  if (tenantId) {
    return or(eq(tenantCol, tenantId), and(isNull(tenantCol), eq(ownerCol, userId)));
  }
  return eq(ownerCol, userId);
}

export function registerInventoryRoutes(app: Express): void {
  // ── Categories ────────────────────────────────────────────────────────────
  app.get("/api/categories", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const rows = await db
      .select()
      .from(categories)
      .where(scopeWhere(categories.tenantId, categories.ownerId, tenantId, userId))
      .orderBy(categories.nombre);
    res.json(rows);
  });

  app.post("/api/categories", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ message: "nombre requerido" });
    const [row] = await db
      .insert(categories)
      .values({ ownerId: userId, tenantId, nombre })
      .returning();
    res.json(row);
  });

  app.put("/api/categories/:id", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const { nombre } = req.body;
    const [row] = await db
      .update(categories)
      .set({ nombre, tenantId: tenantId ?? undefined, updatedAt: new Date() })
      .where(and(eq(categories.id, req.params.id), scopeWhere(categories.tenantId, categories.ownerId, tenantId, userId)))
      .returning();
    if (!row) return res.status(404).json({ message: "No encontrado" });
    res.json(row);
  });

  app.delete("/api/categories/:id", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    await db
      .delete(categories)
      .where(and(eq(categories.id, req.params.id), scopeWhere(categories.tenantId, categories.ownerId, tenantId, userId)));
    res.json({ ok: true });
  });

  // ── Products ──────────────────────────────────────────────────────────────
  app.get("/api/products", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const rows = await db
      .select({
        id: products.id,
        ownerId: products.ownerId,
        categoryId: products.categoryId,
        nombre: products.nombre,
        descripcion: products.descripcion,
        sku: products.sku,
        codigoBarras: products.codigoBarras,
        precio: products.precio,
        costo: products.costo,
        stock: products.stock,
        stockMinimo: products.stockMinimo,
        activo: products.activo,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        categoryNombre: categories.nombre,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(scopeWhere(products.tenantId, products.ownerId, tenantId, userId))
      .orderBy(products.nombre);
    res.json(rows.map((r) => ({ ...r, categories: r.categoryNombre ? { nombre: r.categoryNombre } : null })));
  });

  app.post("/api/products", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const body = req.body;
    const [row] = await db
      .insert(products)
      .values({
        ownerId: userId,
        tenantId,
        nombre: body.nombre,
        descripcion: body.descripcion ?? null,
        sku: body.sku ?? null,
        codigoBarras: body.codigo_barras ?? null,
        precio: String(body.precio ?? 0),
        costo: String(body.costo ?? 0),
        stock: body.stock ?? 0,
        stockMinimo: body.stock_minimo ?? 0,
        categoryId: body.category_id ?? null,
        activo: body.activo ?? true,
      })
      .returning();
    res.json(toProductResponse(row));
  });

  app.put("/api/products/:id", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const body = req.body;
    const [row] = await db
      .update(products)
      .set({
        nombre: body.nombre,
        descripcion: body.descripcion ?? null,
        sku: body.sku ?? null,
        codigoBarras: body.codigo_barras ?? null,
        precio: String(body.precio ?? 0),
        costo: String(body.costo ?? 0),
        stock: body.stock ?? 0,
        stockMinimo: body.stock_minimo ?? 0,
        categoryId: body.category_id ?? null,
        activo: body.activo ?? true,
        tenantId: tenantId ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, req.params.id), scopeWhere(products.tenantId, products.ownerId, tenantId, userId)))
      .returning();
    if (!row) return res.status(404).json({ message: "No encontrado" });
    res.json(toProductResponse(row));
  });

  app.delete("/api/products/:id", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    await db
      .delete(products)
      .where(and(eq(products.id, req.params.id), scopeWhere(products.tenantId, products.ownerId, tenantId, userId)));
    res.json({ ok: true });
  });

  // ── Customers ─────────────────────────────────────────────────────────────
  app.get("/api/customers", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const rows = await db
      .select()
      .from(customers)
      .where(scopeWhere(customers.tenantId, customers.ownerId, tenantId, userId))
      .orderBy(customers.nombre);
    res.json(rows);
  });

  app.post("/api/customers", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const body = req.body;
    const [row] = await db
      .insert(customers)
      .values({
        ownerId: userId,
        tenantId,
        nombre: body.nombre,
        telefono: body.telefono ?? null,
        email: body.email ?? null,
        direccion: body.direccion ?? null,
        observaciones: body.observaciones ?? null,
      })
      .returning();
    res.json(row);
  });

  app.put("/api/customers/:id", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const body = req.body;
    const [row] = await db
      .update(customers)
      .set({
        nombre: body.nombre,
        telefono: body.telefono ?? null,
        email: body.email ?? null,
        direccion: body.direccion ?? null,
        observaciones: body.observaciones ?? null,
        tenantId: tenantId ?? undefined,
      })
      .where(and(eq(customers.id, req.params.id), scopeWhere(customers.tenantId, customers.ownerId, tenantId, userId)))
      .returning();
    if (!row) return res.status(404).json({ message: "No encontrado" });
    res.json(row);
  });

  app.delete("/api/customers/:id", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    await db
      .delete(customers)
      .where(and(eq(customers.id, req.params.id), scopeWhere(customers.tenantId, customers.ownerId, tenantId, userId)));
    res.json({ ok: true });
  });

  // ── Sales ─────────────────────────────────────────────────────────────────
  app.get("/api/sales", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const rows = await db
      .select()
      .from(sales)
      .where(scopeWhere(sales.tenantId, sales.ownerId, tenantId, userId))
      .orderBy(desc(sales.createdAt));
    res.json(rows);
  });

  app.get("/api/sales/:id", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const [sale] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, req.params.id), scopeWhere(sales.tenantId, sales.ownerId, tenantId, userId)));
    if (!sale) return res.status(404).json({ message: "No encontrado" });

    const items = await db
      .select({
        id: saleItems.id,
        saleId: saleItems.saleId,
        productId: saleItems.productId,
        cantidad: saleItems.cantidad,
        precioUnitario: saleItems.precioUnitario,
        subtotal: saleItems.subtotal,
        createdAt: saleItems.createdAt,
        productNombre: products.nombre,
        productSku: products.sku,
      })
      .from(saleItems)
      .leftJoin(products, eq(saleItems.productId, products.id))
      .where(eq(saleItems.saleId, sale.id));

    res.json({
      ...sale,
      sale_items: items.map((i) => ({
        ...i,
        products: { nombre: i.productNombre ?? "", sku: i.productSku ?? null },
      })),
    });
  });

  app.post("/api/sales", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const { items, observacion, customer_id } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "La venta no puede estar vacía" });
    }

    if (customer_id) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, customer_id), scopeWhere(customers.tenantId, customers.ownerId, tenantId, userId)));
      if (!cust) return res.status(400).json({ message: "Cliente no encontrado" });
    }

    const [newSale] = await db
      .insert(sales)
      .values({ ownerId: userId, tenantId, userId, total: "0", observacion: observacion ?? null, customerId: customer_id ?? null })
      .returning();

    let total = 0;
    const seen = new Set<string>();
    for (const item of items) {
      const { product_id, cantidad } = item;
      if (!product_id || !cantidad || cantidad <= 0) {
        return res.status(400).json({ message: "Item inválido" });
      }
      if (seen.has(product_id)) {
        return res.status(400).json({ message: "Producto duplicado en la venta" });
      }
      seen.add(product_id);

      const [prod] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, product_id), scopeWhere(products.tenantId, products.ownerId, tenantId, userId)));
      if (!prod) return res.status(400).json({ message: `Producto no encontrado: ${product_id}` });

      if (prod.stock - cantidad < 0) {
        return res.status(400).json({ message: `Stock insuficiente para ${prod.nombre} (disponible: ${prod.stock})` });
      }

      const precioUnitario = Number(prod.precio);
      const subtotal = precioUnitario * cantidad;
      total += subtotal;

      await db.insert(saleItems).values({
        saleId: newSale.id,
        productId: product_id,
        cantidad,
        precioUnitario: String(precioUnitario),
        subtotal: String(subtotal),
      });

      await db
        .update(products)
        .set({ stock: prod.stock - cantidad, updatedAt: new Date() })
        .where(eq(products.id, product_id));

      await db.insert(stockMovements).values({
        ownerId: userId,
        tenantId,
        userId,
        productId: product_id,
        tipo: "salida",
        cantidad,
        observacion: "Venta",
        referenciaTipo: "sale",
        referenciaId: newSale.id,
      });
    }

    await db.update(sales).set({ total: String(total) }).where(eq(sales.id, newSale.id));
    res.json({ id: newSale.id });
  });

  // ── Stock Movements ───────────────────────────────────────────────────────
  app.get("/api/stock-movements", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const productId = (req as any).query.productId as string | undefined;

    const baseWhere = scopeWhere(stockMovements.tenantId, stockMovements.ownerId, tenantId, userId);
    const where = productId
      ? and(baseWhere, eq(stockMovements.productId, productId))
      : baseWhere;

    const rows = await db
      .select({
        id: stockMovements.id,
        ownerId: stockMovements.ownerId,
        userId: stockMovements.userId,
        productId: stockMovements.productId,
        tipo: stockMovements.tipo,
        cantidad: stockMovements.cantidad,
        observacion: stockMovements.observacion,
        referenciaTipo: stockMovements.referenciaTipo,
        referenciaId: stockMovements.referenciaId,
        createdAt: stockMovements.createdAt,
        productNombre: products.nombre,
        productSku: products.sku,
      })
      .from(stockMovements)
      .leftJoin(products, eq(stockMovements.productId, products.id))
      .where(where)
      .orderBy(desc(stockMovements.createdAt));

    res.json(
      rows.map((r) => ({
        ...r,
        products: { nombre: r.productNombre ?? "", sku: r.productSku ?? null },
      }))
    );
  });

  app.post("/api/stock-movements", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const { product_id, tipo, cantidad, observacion } = req.body;

    if (!product_id || !tipo || !cantidad || cantidad <= 0) {
      return res.status(400).json({ message: "Datos inválidos" });
    }

    const [prod] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, product_id), scopeWhere(products.tenantId, products.ownerId, tenantId, userId)));
    if (!prod) return res.status(400).json({ message: "Producto no encontrado" });

    if (tipo === "salida" && prod.stock - cantidad < 0) {
      return res.status(400).json({ message: `Stock insuficiente (disponible: ${prod.stock})` });
    }

    const [mv] = await db
      .insert(stockMovements)
      .values({ ownerId: userId, tenantId, userId, productId: product_id, tipo, cantidad, observacion: observacion ?? null })
      .returning();

    const newStock = tipo === "entrada" ? prod.stock + cantidad : prod.stock - cantidad;
    await db.update(products).set({ stock: newStock, updatedAt: new Date() }).where(eq(products.id, product_id));

    res.json(mv);
  });
}

function toProductResponse(p: typeof products.$inferSelect) {
  return {
    ...p,
    codigo_barras: p.codigoBarras,
    stock_minimo: p.stockMinimo,
    category_id: p.categoryId,
    owner_id: p.ownerId,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}
