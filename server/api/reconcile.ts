/**
 * Admin reconciliation endpoints.
 *
 * POST /api/admin/reconcile
 *   Executes a full consistency check and repair for a tenant:
 *     1. Backfills products.initialStock (one-time, idempotent).
 *     2. Recalculates products.stock from initialStock + movements.
 *     3. Recalculates cashRegisterSessions.totalSales from active sales.
 *
 * Requires master admin OR runs against the requesting user's own tenant.
 */

import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { wrapAsync } from "../lib/asyncHandler";
import { recalculateCashSession } from "../lib/reconciliation";
import {
  cashRegisterSessions,
  products,
  stockMovements,
} from "@shared/schema";
import { logEvent } from "../lib/logger";

export function registerReconcileRoutes(app: Express): void {
  /**
   * POST /api/admin/reconcile
   *
   * Body (optional):
   *   { tenant_id: string }  — target tenant; master admin only if provided.
   *                            Defaults to the requesting user's own tenant.
   *
   * Flow:
   *   1. Backfill initialStock for every product that hasn't been initialised
   *      yet (initialStock = 0 AND the corrected baseline differs from 0).
   *   2. Recalculate stock for every product in the tenant.
   *   3. Recalculate totalSales for every cash session in the tenant.
   *
   * All steps run inside individual transactions to keep memory bounded.
   * Returns a summary of changes made.
   */
  app.post("/api/admin/reconcile", isAuthenticated, wrapAsync(async (req, res) => {
    const { userId, tenantId: userTenantId } = requireTenant(req);

    const bodyTenantId: string | undefined = req.body?.tenant_id;
    const masterAdminId = process.env.MASTER_ADMIN_ID;
    const isMasterAdmin = masterAdminId && userId === masterAdminId;

    // Determine target tenant
    let targetTenantId: string | null;
    if (bodyTenantId) {
      if (!isMasterAdmin) {
        return res.status(403).json({ message: "Solo el administrador maestro puede reconciliar otros tenants" });
      }
      targetTenantId = bodyTenantId;
    } else {
      targetTenantId = userTenantId;
    }

    if (!targetTenantId) {
      return res.status(400).json({ message: "Tenant no configurado" });
    }

    const tenantId = targetTenantId;
    const summary = {
      products: { total: 0, initialStockBackfilled: 0, stockRecalculated: 0, stockDriftsFixed: 0 },
      cashSessions: { total: 0, recalculated: 0, driftsFixed: 0 },
    };

    // ── Step 1 & 2: Products ────────────────────────────────────────────────
    const allProducts = await db
      .select({ id: products.id, stock: products.stock, initialStock: products.initialStock })
      .from(products)
      .where(eq(products.tenantId, tenantId));

    summary.products.total = allProducts.length;

    for (const prod of allProducts) {
      await db.transaction(async (tx) => {
        // Lock row
        const [locked] = await tx
          .select({ id: products.id, stock: products.stock, initialStock: products.initialStock })
          .from(products)
          .where(and(eq(products.id, prod.id), eq(products.tenantId, tenantId)))
          .for("update");

        if (!locked) return;

        // Compute net movements
        const movRows = await tx
          .select({ tipo: stockMovements.tipo, cantidad: stockMovements.cantidad })
          .from(stockMovements)
          .where(and(eq(stockMovements.productId, prod.id), eq(stockMovements.tenantId, tenantId)));

        let netMovements = 0;
        for (const m of movRows) {
          netMovements += m.tipo === "entrada" ? m.cantidad : -m.cantidad;
        }

        // Backfill initialStock if it was never set
        // Convention: initialStock = 0 means "not yet initialised" unless
        // there are no movements and current stock IS 0 (genuinely zero).
        const needsBackfill = locked.initialStock === 0 && (locked.stock !== 0 || netMovements !== 0);
        if (needsBackfill) {
          const baseline = Math.max(0, locked.stock - netMovements);
          await tx
            .update(products)
            .set({ initialStock: baseline })
            .where(and(eq(products.id, prod.id), eq(products.tenantId, tenantId)));
          // Refresh locked value for recalculation below
          locked.initialStock = baseline;
          summary.products.initialStockBackfilled++;
        }

        // Recalculate stock from source of truth
        const expectedStock = Math.max(0, locked.initialStock + netMovements);
        const oldStock = locked.stock;

        await tx
          .update(products)
          .set({ stock: expectedStock, updatedAt: new Date() })
          .where(and(eq(products.id, prod.id), eq(products.tenantId, tenantId)));

        summary.products.stockRecalculated++;
        if (oldStock !== expectedStock) summary.products.stockDriftsFixed++;
      });
    }

    // ── Step 3: Cash sessions ───────────────────────────────────────────────
    const allSessions = await db
      .select({ id: cashRegisterSessions.id, totalSales: cashRegisterSessions.totalSales })
      .from(cashRegisterSessions)
      .where(eq(cashRegisterSessions.tenantId, tenantId));

    summary.cashSessions.total = allSessions.length;

    for (const sess of allSessions) {
      await db.transaction(async (tx) => {
        const oldTotal = sess.totalSales ? Number(sess.totalSales) : 0;
        const newTotal = await recalculateCashSession(sess.id, tenantId, tx);
        summary.cashSessions.recalculated++;
        if (Math.abs(oldTotal - newTotal) > 0.001) summary.cashSessions.driftsFixed++;
      });
    }

    logEvent({
      module: "reconcile",
      event: "RECONCILE_RUN",
      message: `Reconciliación completada: ${summary.products.stockDriftsFixed} drifts de stock, ${summary.cashSessions.driftsFixed} drifts de caja`,
      userId,
      ownerId: userId,
      tenantId,
      details: summary,
    });

    res.json({ ok: true, summary });
  }));
}
