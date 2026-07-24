import type { Express } from "express";
import { eq, and, desc, ilike, or, isNull, sql, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { calculateCashImpact, recalculateCashSession, recalculateStock } from "../lib/reconciliation";
import { evaluateStockAlerts, broadcastStockAlert } from "../lib/stockAlerts";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { broadcast } from "../lib/events";
import { wrapAsync } from "../lib/asyncHandler";
import {
  categories,
  products,
  customers,
  customerAccounts,
  customerAccountMovements,
  sales,
  saleItems,
  stockMovements,
  receiptSettings,
  cashRegisterSessions,
} from "@shared/schema";

/**
 * Ajusta el saldo de cuenta corriente de un cliente dentro de una transacción.
 * delta > 0  → el cliente debe más (nueva deuda)
 * delta < 0  → el cliente debe menos (anulación o pago)
 */
async function adjustCustomerAccountBalance(
  customerId: string,
  tenantId: string,
  delta: number,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  movement?: {
    type: "sale" | "payment" | "sale_void" | "sale_edit" | "adjustment";
    referenceId?: string | null;
    referenceType?: string | null;
    observacion?: string | null;
    paymentMethod?: string | null;
  },
) {
  if (delta === 0) return;
  const [updated] = await tx
    .insert(customerAccounts)
    .values({
      tenantId,
      customerId,
      balance: String(delta),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [customerAccounts.tenantId, customerAccounts.customerId],
      set: {
        balance: sql`${customerAccounts.balance} + ${String(delta)}`,
        updatedAt: new Date(),
      },
    })
    .returning({ balance: customerAccounts.balance });

  if (movement) {
    await tx.insert(customerAccountMovements).values({
      tenantId,
      customerId,
      type: movement.type,
      referenceId: movement.referenceId ?? null,
      referenceType: movement.referenceType ?? null,
      amount: String(delta),
      balanceAfter: updated?.balance ?? "0",
      observacion: movement.observacion ?? null,
      paymentMethod: movement.paymentMethod ?? null,
    });
  }
}

function noTenant(res: any) {
  return res.status(500).json({ message: "Tenant no configurado. Cerrá sesión y volvé a ingresar." });
}

function parseIfUnmodifiedSince(req: any): Date | null {
  const header = req.headers["x-if-unmodified-since"];
  if (!header || typeof header !== "string") return null;
  const d = new Date(header);
  return isNaN(d.getTime()) ? null : d;
}

export function registerInventoryRoutes(app: Express): void {
  // ── Categories ────────────────────────────────────────────────────────────
  app.get("/api/categories", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.tenantId, tenantId))
      .orderBy(categories.nombre);
    res.json(rows);
  }));

  app.post("/api/categories", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ message: "nombre requerido" });
    const [row] = await db
      .insert(categories)
      .values({ ownerId: userId, tenantId, nombre })
      .returning();
    res.json(row);
    broadcast(tenantId, { type: "invalidate", entities: ["categories"] });
  }));

  app.put("/api/categories/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    const { nombre } = req.body;

    const clientDate = parseIfUnmodifiedSince(req);
    if (clientDate) {
      const [current] = await db
        .select({ updatedAt: categories.updatedAt })
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)));
      if (current && current.updatedAt > clientDate) {
        return res.status(409).json({ message: "Conflict" });
      }
    }

    const [row] = await db
      .update(categories)
      .set({ nombre, updatedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ message: "No encontrado" });
    res.json(row);
    broadcast(tenantId, { type: "invalidate", entities: ["categories"] });
  }));

  app.delete("/api/categories/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)));
    res.json({ ok: true });
    broadcast(tenantId, { type: "invalidate", entities: ["categories", "products"] });
  }));

  // ── Products ──────────────────────────────────────────────────────────────
  app.get("/api/products", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
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
      .where(eq(products.tenantId, tenantId))
      .orderBy(products.nombre);
    res.json(rows.map((r) => ({
      ...r,
      // Exponer ambas formas del campo para compatibilidad con frontend
      stock_minimo: r.stockMinimo,
      category_id: r.categoryId,       // alias snake_case para compatibilidad con frontend
      codigo_barras: r.codigoBarras,   // alias snake_case para compatibilidad con frontend
      categories: r.categoryNombre ? { nombre: r.categoryNombre } : null,
    })));
  }));

  // ── Búsqueda inteligente de productos (para ProductPicker) ──────────────────
  app.get("/api/products/search", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const q = ((req as any).query.q as string | undefined)?.trim() ?? "";
    const limit = Math.min(Number((req as any).query.limit ?? 20), 50);

    if (!q) return res.json([]);

    const pattern = `%${q}%`;
    const rows = await db
      .select({
        id: products.id,
        nombre: products.nombre,
        sku: products.sku,
        codigoBarras: products.codigoBarras,
        stock: products.stock,
        categoryNombre: categories.nombre,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.activo, true),
          or(
            ilike(products.nombre, pattern),
            ilike(products.sku, pattern),
            ilike(products.codigoBarras, pattern),
            ilike(categories.nombre, pattern),
          ),
        ),
      )
      .orderBy(products.nombre)
      .limit(limit);

    res.json(
      rows.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        sku: r.sku ?? null,
        codigoBarras: r.codigoBarras ?? null,
        stock: r.stock,
        categoryNombre: r.categoryNombre ?? null,
      })),
    );
  }));

  app.post("/api/products", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
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
        initialStock: body.stock ?? 0,
        stockMinimo: body.stock_minimo ?? 0,
        categoryId: body.category_id ?? null,
        activo: body.activo ?? true,
      })
      .returning();
    res.json(toProductResponse(row));
    broadcast(tenantId, { type: "invalidate", entities: ["products"] });
  }));

  app.put("/api/products/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    const body = req.body;

    const clientDate = parseIfUnmodifiedSince(req);
    if (clientDate) {
      const [current] = await db
        .select({ updatedAt: products.updatedAt })
        .from(products)
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));
      if (current && current.updatedAt > clientDate) {
        return res.status(409).json({ message: "Conflict" });
      }
    }

    // Pre-leer stock anterior para detectar cambio de estado de alerta
    const [oldProdForAlert] = await db
      .select({ nombre: products.nombre, stock: products.stock, stockMinimo: products.stockMinimo })
      .from(products)
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));

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
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ message: "No encontrado" });
    res.json(toProductResponse(row));
    if (oldProdForAlert) {
      const prodEditAlert = evaluateStockAlerts(id, oldProdForAlert.nombre, oldProdForAlert.stock, row.stock, row.stockMinimo);
      if (prodEditAlert) broadcastStockAlert(tenantId, prodEditAlert);
    }
    broadcast(tenantId, { type: "invalidate", entities: ["products"] });
  }));

  app.delete("/api/products/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    try {
      await db
        .delete(products)
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));
      res.json({ ok: true });
      broadcast(tenantId, { type: "invalidate", entities: ["products"] });
    } catch (err: any) {
      if (err?.code === "23503") {
        const detail: string = err?.detail ?? err?.message ?? "";
        if (detail.includes("sale_items")) {
          return res.status(409).json({
            message: "No se puede eliminar: el producto tiene ventas registradas. Desactivá el producto en su lugar.",
          });
        }
        if (detail.includes("stock_movements")) {
          return res.status(409).json({
            message: "No se puede eliminar: el producto tiene movimientos de stock registrados. Desactivá el producto en su lugar.",
          });
        }
        return res.status(409).json({
          message: "No se puede eliminar: el producto está referenciado en otros registros.",
        });
      }
      return res.status(500).json({
        message: "Error interno al eliminar el producto.",
      });
    }
  }));

  // ── Customers ─────────────────────────────────────────────────────────────
  app.get("/api/customers", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const rows = await db
      .select({
        id: customers.id,
        ownerId: customers.ownerId,
        tenantId: customers.tenantId,
        nombre: customers.nombre,
        telefono: customers.telefono,
        email: customers.email,
        direccion: customers.direccion,
        observaciones: customers.observaciones,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        balance: customerAccounts.balance,
      })
      .from(customers)
      .leftJoin(
        customerAccounts,
        and(
          eq(customerAccounts.customerId, customers.id),
          eq(customerAccounts.tenantId, tenantId),
        ),
      )
      .where(eq(customers.tenantId, tenantId))
      .orderBy(customers.nombre);
    res.json(rows);
  }));

  app.get("/api/customers/:id/account", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);

    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
    if (!customer) return res.status(404).json({ message: "Cliente no encontrado" });

    const [account] = await db
      .select({ balance: customerAccounts.balance, updatedAt: customerAccounts.updatedAt })
      .from(customerAccounts)
      .where(and(eq(customerAccounts.customerId, id), eq(customerAccounts.tenantId, tenantId)));

    const movements = await db
      .select()
      .from(customerAccountMovements)
      .where(and(eq(customerAccountMovements.customerId, id), eq(customerAccountMovements.tenantId, tenantId)))
      .orderBy(desc(customerAccountMovements.createdAt));

    res.json({
      customer,
      balance: account?.balance ?? "0",
      movements,
    });
  }));

  app.post("/api/customers/:id/payment", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    const { amount, observacion, payment_method } = req.body;

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ message: "El importe debe ser mayor a cero" });
    }
    if (!payment_method || !["cash", "transfer"].includes(String(payment_method))) {
      return res.status(400).json({ message: "Forma de pago inválida. Seleccioná efectivo o transferencia." });
    }

    try {
      await db.transaction(async (tx) => {
        const [cust] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
        if (!cust) throw Object.assign(new Error("Cliente no encontrado"), { status: 404 });

        const [account] = await tx
          .select({ balance: customerAccounts.balance })
          .from(customerAccounts)
          .where(and(eq(customerAccounts.customerId, id), eq(customerAccounts.tenantId, tenantId)))
          .for("update");

        const currentBalance = Number(account?.balance ?? 0);
        if (amountNum > currentBalance + 0.001) {
          throw Object.assign(
            new Error(`El pago (${amountNum.toFixed(2)}) supera el saldo pendiente (${currentBalance.toFixed(2)})`),
            { status: 400 },
          );
        }

        // Registrar movimiento en cuenta corriente con forma de pago
        await adjustCustomerAccountBalance(id, tenantId, -amountNum, tx, {
          type: "payment",
          referenceId: null,
          referenceType: "payment",
          observacion: (observacion as string | undefined)?.trim() || null,
          paymentMethod: payment_method,
        });

        // Actualizar la sesión de caja activa del usuario (si existe)
        const [activeSession] = await tx
          .select({ id: cashRegisterSessions.id })
          .from(cashRegisterSessions)
          .where(and(
            eq(cashRegisterSessions.tenantId, tenantId),
            eq(cashRegisterSessions.userId, userId),
            eq(cashRegisterSessions.status, "open"),
          ))
          .for("update");

        if (activeSession) {
          if (payment_method === "cash") {
            await tx
              .update(cashRegisterSessions)
              .set({ accountPaymentsCash: sql`account_payments_cash + ${String(amountNum)}` })
              .where(eq(cashRegisterSessions.id, activeSession.id));
          } else {
            await tx
              .update(cashRegisterSessions)
              .set({ accountPaymentsTransfer: sql`account_payments_transfer + ${String(amountNum)}` })
              .where(eq(cashRegisterSessions.id, activeSession.id));
          }
        }
      });

      res.json({ ok: true });
      broadcast(tenantId, { type: "invalidate", entities: ["customer_accounts", "customers", "cash_session"] });
    } catch (err: any) {
      const status = err?.status === 404 ? 404 : err?.status === 400 ? 400 : 500;
      res.status(status).json({ message: err?.message ?? "Error al registrar pago" });
    }
  }));

  app.post("/api/customers", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
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
    broadcast(tenantId, { type: "invalidate", entities: ["customers"] });
  }));

  app.put("/api/customers/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    const body = req.body;

    const clientDate = parseIfUnmodifiedSince(req);
    if (clientDate) {
      const [current] = await db
        .select({ updatedAt: customers.updatedAt })
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
      if (current && current.updatedAt > clientDate) {
        return res.status(409).json({ message: "Conflict" });
      }
    }

    const [row] = await db
      .update(customers)
      .set({
        nombre: body.nombre,
        telefono: body.telefono ?? null,
        email: body.email ?? null,
        direccion: body.direccion ?? null,
        observaciones: body.observaciones ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ message: "No encontrado" });
    res.json(row);
    broadcast(tenantId, { type: "invalidate", entities: ["customers"] });
  }));

  app.delete("/api/customers/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    await db
      .delete(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
    res.json({ ok: true });
    broadcast(tenantId, { type: "invalidate", entities: ["customers"] });
  }));

  // ── Sales ─────────────────────────────────────────────────────────────────
  app.get("/api/sales", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const rows = await db
      .select()
      .from(sales)
      .where(eq(sales.tenantId, tenantId))
      .orderBy(desc(sales.createdAt));
    res.json(rows);
  }));

  app.get("/api/sales/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    const [sale] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), eq(sales.tenantId, tenantId)));
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
  }));

  app.put("/api/sales/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    const { items, observacion, customer_id, payment_method, paid_amount, credit_amount, transfer_amount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "La venta no puede estar vacía" });
    }

    const seen = new Set<string>();
    for (const item of items) {
      const { product_id, cantidad } = item;
      if (!product_id || !cantidad || cantidad <= 0 || !Number.isInteger(Number(cantidad))) {
        return res.status(400).json({ message: "Item inválido" });
      }
      if (seen.has(product_id)) {
        return res.status(400).json({ message: "Producto duplicado en la venta" });
      }
      seen.add(product_id);
    }

    // Validate payment method + paid_amount
    if (payment_method != null && !["cash", "transfer", "account", "mixed"].includes(String(payment_method))) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }
    if (payment_method === "mixed" && paid_amount != null) {
      const pa = Number(paid_amount);
      if (!Number.isFinite(pa) || pa < 0) {
        return res.status(400).json({ message: "Monto en efectivo inválido para pago mixto" });
      }
    }
    // Cuenta corriente requiere cliente
    const effectiveEditPm = payment_method !== undefined ? payment_method : undefined;
    if (effectiveEditPm === "account" && !customer_id) {
      return res.status(400).json({ message: "Cuenta corriente requiere seleccionar un cliente" });
    }

    const editStockAlerts: ReturnType<typeof evaluateStockAlerts>[] = [];

    try {
      const updated = await db.transaction(async (tx) => {
        // 1. Cargar venta con row-level lock para serializar ediciones concurrentes
        const [sale] = await tx
          .select()
          .from(sales)
          .where(and(eq(sales.id, id), eq(sales.tenantId, tenantId)))
          .for("update");
        if (!sale) throw Object.assign(new Error("Venta no encontrada"), { status: 404 });
        if (sale.status === "void") {
          throw Object.assign(new Error("No se puede editar una venta anulada"), { status: 400 });
        }

        // 2. Bloquear edición si la sesión de caja está cerrada
        if (sale.cashSessionId) {
          const [sess] = await tx
            .select({ status: cashRegisterSessions.status })
            .from(cashRegisterSessions)
            .where(and(eq(cashRegisterSessions.id, sale.cashSessionId), eq(cashRegisterSessions.tenantId, tenantId)));
          if (sess?.status === "closed") {
            throw Object.assign(
              new Error("No se puede editar una venta de una sesión de caja cerrada"),
              { status: 400 }
            );
          }
        }

        // 3. Validar cliente si se envía
        if (customer_id) {
          const [cust] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(and(eq(customers.id, customer_id), eq(customers.tenantId, tenantId)));
          if (!cust) throw Object.assign(new Error("Cliente no encontrado"), { status: 400 });
        }

        // 4. Obtener items originales
        const oldItems = await tx
          .select()
          .from(saleItems)
          .where(eq(saleItems.saleId, id));

        // 5. Revertir stock original + registrar movimientos de reversión
        for (const oldItem of oldItems) {
          const [prod] = await tx
            .select()
            .from(products)
            .where(and(eq(products.id, oldItem.productId), eq(products.tenantId, tenantId)))
            .for("update");
          if (!prod) continue; // producto eliminado, omitir

          const newStockRevert = prod.stock + oldItem.cantidad;
          await tx
            .update(products)
            .set({ stock: newStockRevert, updatedAt: new Date() })
            .where(and(eq(products.id, oldItem.productId), eq(products.tenantId, tenantId)));
          editStockAlerts.push(evaluateStockAlerts(oldItem.productId, prod.nombre, prod.stock, newStockRevert, prod.stockMinimo));

          await tx.insert(stockMovements).values({
            ownerId: userId,
            tenantId,
            userId,
            productId: oldItem.productId,
            tipo: "entrada",
            cantidad: oldItem.cantidad,
            observacion: "Reversión por edición de venta",
            referenciaTipo: "sale_edit",
            referenciaId: id,
          });
        }

        // 6. Eliminar items anteriores
        await tx.delete(saleItems).where(eq(saleItems.saleId, id));

        // 7. Insertar nuevos items y descontar stock
        let total = 0;
        for (const item of items) {
          const { product_id, cantidad } = item;

          const [prod] = await tx
            .select()
            .from(products)
            .where(and(eq(products.id, product_id), eq(products.tenantId, tenantId)))
            .for("update");

          if (!prod) {
            throw Object.assign(new Error(`Producto no encontrado: ${product_id}`), { status: 400 });
          }
          if (prod.stock < cantidad) {
            throw Object.assign(
              new Error(`Stock insuficiente para "${prod.nombre}" (disponible: ${prod.stock})`),
              { status: 400 }
            );
          }

          const precioUnitario = Number(prod.precio);
          const subtotal = precioUnitario * cantidad;
          total += subtotal;

          await tx.insert(saleItems).values({
            saleId: id,
            productId: product_id,
            cantidad,
            precioUnitario: String(precioUnitario),
            subtotal: String(subtotal),
          });

          const newStockEdit = prod.stock - cantidad;
          await tx
            .update(products)
            .set({ stock: newStockEdit, updatedAt: new Date() })
            .where(and(eq(products.id, product_id), eq(products.tenantId, tenantId)));
          editStockAlerts.push(evaluateStockAlerts(product_id, prod.nombre, prod.stock, newStockEdit, prod.stockMinimo));

          await tx.insert(stockMovements).values({
            ownerId: userId,
            tenantId,
            userId,
            productId: product_id,
            tipo: "salida",
            cantidad,
            observacion: "Edición de venta",
            referenciaTipo: "sale_edit",
            referenciaId: id,
          });
        }

        // 8. Actualizar venta (tenantId en WHERE garantiza aislamiento multi-tenant)
        // Preservar método de pago si no se envía en la request
        const pmNorm = payment_method !== undefined
          ? (payment_method && typeof payment_method === "string" ? payment_method : null)
          : sale.paymentMethod;
        const paidAmountVal = payment_method !== undefined
          ? (paid_amount != null ? String(Number(paid_amount)) : null)
          : sale.paidAmount;
        const creditAmountVal = payment_method !== undefined
          ? (credit_amount != null ? String(Number(credit_amount)) : null)
          : sale.creditAmount;
        const transferAmountVal = payment_method !== undefined
          ? (transfer_amount != null ? String(Number(transfer_amount)) : null)
          : sale.transferAmount;
        const cashImpact = calculateCashImpact({ total, paymentMethod: pmNorm, paidAmount: paidAmountVal });

        // Cuenta corriente: capturar estado anterior ANTES de actualizar
        const oldAccountCredit =
          sale.paymentMethod === "account" && sale.customerId && sale.creditAmount
            ? { customerId: sale.customerId, amount: Number(sale.creditAmount) }
            : null;

        const [result] = await tx
          .update(sales)
          .set({
            total: String(total),
            observacion: observacion !== undefined ? (observacion ?? null) : sale.observacion,
            customerId: customer_id !== undefined ? (customer_id ?? null) : sale.customerId,
            paymentMethod: pmNorm,
            paidAmount: paidAmountVal,
            creditAmount: creditAmountVal,
            transferAmount: transferAmountVal,
            cashAmount: String(cashImpact),
            updatedAt: new Date(),
          })
          .where(and(eq(sales.id, id), eq(sales.tenantId, tenantId)))
          .returning();

        // Cuenta corriente: ajustar saldo (revertir anterior, aplicar nuevo)
        if (oldAccountCredit) {
          await adjustCustomerAccountBalance(oldAccountCredit.customerId, tenantId, -oldAccountCredit.amount, tx, {
            type: "sale_edit",
            referenceId: id,
            referenceType: "sale",
            observacion: "Edición de venta (reverso)",
          });
        }
        if (pmNorm === "account" && result.customerId && creditAmountVal) {
          await adjustCustomerAccountBalance(result.customerId, tenantId, Number(creditAmountVal), tx, {
            type: "sale_edit",
            referenceId: id,
            referenceType: "sale",
          });
        }

        // Phase 4 — anti-drift: reconcile cash session total after edit
        if (sale.cashSessionId) {
          await recalculateCashSession(sale.cashSessionId, tenantId, tx);
        }

        return result;
      });

      res.json(updated);
      for (const a of editStockAlerts) if (a) broadcastStockAlert(tenantId, a);
      broadcast(tenantId, { type: "invalidate", entities: ["sales", "products", "stock_movements", "cash_session"] });
    } catch (err: any) {
      const status = err?.status === 404 ? 404 : err?.status === 400 ? 400 : 500;
      res.status(status).json({ message: err?.message ?? "Error al editar la venta" });
    }
  }));

  app.delete("/api/sales/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    const voidStockAlerts: ReturnType<typeof evaluateStockAlerts>[] = [];

    try {
      await db.transaction(async (tx) => {
        // 1. Cargar venta con row-level lock para serializar anulaciones concurrentes
        const [sale] = await tx
          .select()
          .from(sales)
          .where(and(eq(sales.id, id), eq(sales.tenantId, tenantId)))
          .for("update");
        if (!sale) throw Object.assign(new Error("Venta no encontrada"), { status: 404 });

        // 2. Idempotente: ya anulada
        if (sale.status === "void") return;

        // 3. Bloquear anulación si la sesión de caja está cerrada
        if (sale.cashSessionId) {
          const [sess] = await tx
            .select({ status: cashRegisterSessions.status })
            .from(cashRegisterSessions)
            .where(and(eq(cashRegisterSessions.id, sale.cashSessionId), eq(cashRegisterSessions.tenantId, tenantId)));
          if (sess?.status === "closed") {
            throw Object.assign(
              new Error("No se puede anular una venta de una sesión de caja cerrada"),
              { status: 400 }
            );
          }
        }

        // 4. Obtener items de la venta
        const items = await tx
          .select()
          .from(saleItems)
          .where(eq(saleItems.saleId, id));

        // 5. Marcar venta como anulada (tenantId en WHERE garantiza aislamiento multi-tenant)
        await tx
          .update(sales)
          .set({ status: "void", deletedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(sales.id, id), eq(sales.tenantId, tenantId)));

        // 6. Revertir stock + registrar movimientos de anulación
        for (const item of items) {
          const [prod] = await tx
            .select()
            .from(products)
            .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)))
            .for("update");
          if (!prod) continue;

          const newStockVoid = prod.stock + item.cantidad;
          await tx
            .update(products)
            .set({ stock: newStockVoid, updatedAt: new Date() })
            .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)));
          voidStockAlerts.push(evaluateStockAlerts(item.productId, prod.nombre, prod.stock, newStockVoid, prod.stockMinimo));

          await tx.insert(stockMovements).values({
            ownerId: userId,
            tenantId,
            userId,
            productId: item.productId,
            tipo: "entrada",
            cantidad: item.cantidad,
            observacion: "Anulación de venta",
            referenciaTipo: "sale_void",
            referenciaId: id,
          });
        }

        // Cuenta corriente: revertir saldo pendiente al anular
        if (sale.paymentMethod === "account" && sale.customerId && sale.creditAmount) {
          await adjustCustomerAccountBalance(sale.customerId, tenantId, -Number(sale.creditAmount), tx, {
            type: "sale_void",
            referenceId: id,
            referenceType: "sale",
            observacion: "Anulación de venta",
          });
        }

        // Phase 4 — anti-drift: reconcile cash session total after void
        if (sale.cashSessionId) {
          await recalculateCashSession(sale.cashSessionId, tenantId, tx);
        }
      });

      res.json({ ok: true });
      for (const a of voidStockAlerts) if (a) broadcastStockAlert(tenantId, a);
      broadcast(tenantId, { type: "invalidate", entities: ["sales", "products", "stock_movements", "cash_session"] });
    } catch (err: any) {
      const status = err?.status === 404 ? 404 : err?.status === 400 ? 400 : 500;
      res.status(status).json({ message: err?.message ?? "Error al anular la venta" });
    }
  }));

  app.post("/api/sales", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const { items, observacion, customer_id, client_id, payment_method, paid_amount, credit_amount, transfer_amount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "La venta no puede estar vacía" });
    }

    const seen = new Set<string>();
    for (const item of items) {
      const { product_id, cantidad } = item;
      if (!product_id || !cantidad || cantidad <= 0 || !Number.isInteger(Number(cantidad))) {
        return res.status(400).json({ message: "Item inválido" });
      }
      if (seen.has(product_id)) {
        return res.status(400).json({ message: "Producto duplicado en la venta" });
      }
      seen.add(product_id);
    }

    if (client_id && typeof client_id === "string") {
      const [existing] = await db
        .select({ id: sales.id, receiptNumber: sales.receiptNumber })
        .from(sales)
        .where(and(eq(sales.tenantId, tenantId), eq(sales.clientId, client_id)));
      if (existing) {
        return res.json({ id: existing.id, receiptNumber: existing.receiptNumber ?? null });
      }
    }

    // Validate payment method + paid_amount
    const VALID_PMS = ["cash", "transfer", "account", "mixed"];
    if (payment_method != null && !VALID_PMS.includes(String(payment_method))) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }
    if (payment_method === "mixed" && paid_amount != null) {
      const pa = Number(paid_amount);
      if (!Number.isFinite(pa) || pa < 0) {
        return res.status(400).json({ message: "Monto en efectivo inválido para pago mixto" });
      }
    }
    // Cuenta corriente requiere cliente
    if (payment_method === "account" && !customer_id) {
      return res.status(400).json({ message: "Cuenta corriente requiere seleccionar un cliente" });
    }

    // Acumula notificaciones de cambio de estado de stock (se emiten tras el commit)
    const saleStockAlerts: ReturnType<typeof evaluateStockAlerts>[] = [];

    try {
      const result = await db.transaction(async (tx) => {
        if (customer_id) {
          const [cust] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(and(eq(customers.id, customer_id), eq(customers.tenantId, tenantId)));
          if (!cust) throw Object.assign(new Error("Cliente no encontrado"), { status: 400 });
        }

        const [activeSession] = await tx
          .select({ id: cashRegisterSessions.id })
          .from(cashRegisterSessions)
          .where(and(
            eq(cashRegisterSessions.tenantId, tenantId),
            eq(cashRegisterSessions.userId, userId),
            eq(cashRegisterSessions.status, "open"),
          ))
          .limit(1);

        const [newSale] = await tx
          .insert(sales)
          .values({
            ownerId: userId,
            tenantId,
            userId,
            clientId: client_id && typeof client_id === "string" ? client_id : null,
            total: "0",
            observacion: observacion ?? null,
            customerId: customer_id ?? null,
            cashSessionId: activeSession?.id ?? null,
          })
          .returning();

        let total = 0;

        for (const item of items) {
          const { product_id, cantidad } = item;

          const [prod] = await tx
            .select()
            .from(products)
            .where(and(eq(products.id, product_id), eq(products.tenantId, tenantId)))
            .for("update");

          if (!prod) {
            throw Object.assign(
              new Error(`Producto no encontrado: ${product_id}`),
              { status: 400 }
            );
          }

          if (prod.stock < cantidad) {
            throw Object.assign(
              new Error(`Stock insuficiente para "${prod.nombre}" (disponible: ${prod.stock})`),
              { status: 400 }
            );
          }

          const precioUnitario = Number(prod.precio);
          const subtotal = precioUnitario * cantidad;
          total += subtotal;

          await tx.insert(saleItems).values({
            saleId: newSale.id,
            productId: product_id,
            cantidad,
            precioUnitario: String(precioUnitario),
            subtotal: String(subtotal),
          });

          const newStockSale = prod.stock - cantidad;
          await tx
            .update(products)
            .set({ stock: newStockSale, updatedAt: new Date() })
            .where(eq(products.id, product_id));
          saleStockAlerts.push(evaluateStockAlerts(product_id, prod.nombre, prod.stock, newStockSale, prod.stockMinimo));

          await tx.insert(stockMovements).values({
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

        let receiptNumber: string | null = null;
        const [rSettings] = await tx
          .select()
          .from(receiptSettings)
          .where(eq(receiptSettings.tenantId, tenantId))
          .for("update");

        if (rSettings?.habilitado) {
          const numero = rSettings.proximoNumero;
          await tx
            .update(receiptSettings)
            .set({ proximoNumero: rSettings.proximoNumero + 1, updatedAt: new Date() })
            .where(eq(receiptSettings.tenantId, tenantId));
          receiptNumber = `${rSettings.prefijoNumeracion}-${numero.toString().padStart(6, "0")}`;
        }

        // Calcular impacto en caja según método de pago
        const pmNorm = payment_method && typeof payment_method === "string" ? payment_method : null;
        const cashImpact = calculateCashImpact({ total, paymentMethod: pmNorm, paidAmount: paid_amount ?? null });

        await tx
          .update(sales)
          .set({
            total: String(total),
            receiptNumber,
            paymentMethod: pmNorm,
            paidAmount: paid_amount != null ? String(Number(paid_amount)) : null,
            creditAmount: credit_amount != null ? String(Number(credit_amount)) : null,
            transferAmount: transfer_amount != null ? String(Number(transfer_amount)) : null,
            cashAmount: String(cashImpact),
          })
          .where(eq(sales.id, newSale.id));

        // Cuenta corriente: registrar saldo pendiente del cliente
        if (pmNorm === "account" && customer_id) {
          await adjustCustomerAccountBalance(customer_id, tenantId, total, tx, {
            type: "sale",
            referenceId: newSale.id,
            referenceType: "sale",
          });
        }

        // Phase 4 — anti-drift: reconcile cash session total after each sale
        if (activeSession?.id) {
          await recalculateCashSession(activeSession.id, tenantId, tx);
        }

        return { id: newSale.id, receiptNumber };
      });

      res.json(result);
      for (const a of saleStockAlerts) if (a) broadcastStockAlert(tenantId, a);
      broadcast(tenantId, { type: "invalidate", entities: ["sales", "products", "stock_movements", "cash_session", "customers"] });
    } catch (err: any) {
      const status = (err as any).status === 400 ? 400 : 500;
      const message = err?.message ?? "Error al registrar la venta";
      res.status(status).json({ message });
    }
  }));

  // ── Centro de Alertas de Stock ────────────────────────────────────────────
  // Calcula el estado en tiempo real desde products.stock y products.stock_minimo.
  // Sin tabla adicional — el inventario es la única fuente de verdad.
  app.get("/api/stock-alerts", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);

    const rows = await db
      .select({
        id: products.id,
        nombre: products.nombre,
        sku: products.sku,
        stock: products.stock,
        stockMinimo: products.stockMinimo,
      })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.activo, true)))
      .orderBy(products.stock);

    const sinStock = rows
      .filter((p) => p.stock <= 0)
      .map((p) => ({ ...p, estado: "sin_stock" as const }));
    const stockBajo = rows
      .filter((p) => p.stock > 0 && p.stockMinimo > 0 && p.stock <= p.stockMinimo)
      .map((p) => ({ ...p, estado: "stock_bajo" as const }));

    res.json({ sinStock, stockBajo, total: sinStock.length + stockBajo.length });
  }));

  // ── Stock Movements ───────────────────────────────────────────────────────
  app.get("/api/stock-movements", isAuthenticated, wrapAsync(async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const productId = (req as any).query.productId as string | undefined;
    const q = ((req as any).query.q as string | undefined)?.trim();
    const tipo = (req as any).query.tipo as string | undefined;
    const fechaDesde = (req as any).query.fechaDesde as string | undefined;
    const fechaHasta = (req as any).query.fechaHasta as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [eq(stockMovements.tenantId, tenantId) as any];
    if (productId) conditions.push(eq(stockMovements.productId, productId) as any);
    if (tipo === "entrada" || tipo === "salida") {
      conditions.push(eq(stockMovements.tipo, tipo) as any);
    }
    if (fechaDesde) {
      conditions.push(gte(stockMovements.createdAt, new Date(fechaDesde)) as any);
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.createdAt, hasta) as any);
    }
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(products.nombre, pattern),
          ilike(products.sku, pattern),
          ilike(products.codigoBarras, pattern),
          ilike(categories.nombre, pattern),
          ilike(stockMovements.observacion, pattern),
        ) as any,
      );
    }

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
        voidedAt: stockMovements.voidedAt,
        voidedBy: stockMovements.voidedBy,
        voidReason: stockMovements.voidReason,
        createdAt: stockMovements.createdAt,
        productNombre: products.nombre,
        productSku: products.sku,
      })
      .from(stockMovements)
      .leftJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(stockMovements.createdAt));

    res.json(
      rows.map((r) => ({
        ...r,
        voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
        products: { nombre: r.productNombre ?? "", sku: r.productSku ?? null },
      }))
    );
  }));

  // Soft delete / anulación de movimiento manual
  app.delete("/api/stock-movements/:id", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const id = String(req.params.id);
    const { void_reason } = req.body ?? {};

    let delMvAlert: ReturnType<typeof evaluateStockAlerts> = null;

    await db.transaction(async (tx) => {
      const [mv] = await tx
        .select()
        .from(stockMovements)
        .where(and(eq(stockMovements.id, id), eq(stockMovements.tenantId, tenantId)));

      if (!mv) throw Object.assign(new Error("Movimiento no encontrado"), { status: 404 });
      if (mv.voidedAt) throw Object.assign(new Error("El movimiento ya está anulado"), { status: 400 });
      if (
        mv.referenciaTipo === "sale" ||
        mv.referenciaTipo === "sale_edit" ||
        mv.referenciaTipo === "sale_void"
      ) {
        throw Object.assign(
          new Error("Los movimientos generados por ventas no pueden anularse directamente"),
          { status: 400 },
        );
      }

      // Pre-leer stock antes de recalcular para detectar cambio de estado
      const [prodBefore] = await tx
        .select({ nombre: products.nombre, stock: products.stock, stockMinimo: products.stockMinimo })
        .from(products)
        .where(and(eq(products.id, mv.productId), eq(products.tenantId, tenantId)));

      await tx
        .update(stockMovements)
        .set({ voidedAt: new Date(), voidedBy: userId, voidReason: void_reason ?? null })
        .where(and(eq(stockMovements.id, id), eq(stockMovements.tenantId, tenantId)));

      const newStockCalc = await recalculateStock(mv.productId, tenantId, tx);

      if (prodBefore) {
        delMvAlert = evaluateStockAlerts(mv.productId, prodBefore.nombre, prodBefore.stock, newStockCalc, prodBefore.stockMinimo);
      }
    });

    res.json({ ok: true });
    if (delMvAlert) broadcastStockAlert(tenantId, delMvAlert);
    broadcast(tenantId, { type: "invalidate", entities: ["stock_movements", "products"] });
  }));

  app.post("/api/stock-movements", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return noTenant(res);
    const { product_id, tipo, cantidad, observacion } = req.body;

    if (!product_id || !tipo || !cantidad || cantidad <= 0) {
      return res.status(400).json({ message: "Datos inválidos" });
    }

    const [prod] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, product_id), eq(products.tenantId, tenantId)));
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
    const mvAlert = evaluateStockAlerts(product_id, prod.nombre, prod.stock, newStock, prod.stockMinimo);
    if (mvAlert) broadcastStockAlert(tenantId, mvAlert);

    res.json(mv);
    broadcast(tenantId, { type: "invalidate", entities: ["stock_movements", "products"] });
  }));
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
