import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
  createCategory,
  createCustomer,
  createProduct,
  createSale,
  type CustomerInput,
  type ProductInput,
  type SaleItemInput,
} from "@/lib/api/inventory";
import { dequeue, listPending, requeueProcessingOlderThan, updateStatus } from "./queue";
import { log } from "./logger";

type OfflineSalePayload = {
  items: SaleItemInput[];
  observacion?: string | null;
  customer_id?: string | null;
  client_id: string;
};

let isSyncing = false;

async function safeUpdateStatus(
  id: number,
  status: "pending" | "processing",
): Promise<void> {
  try {
    await updateStatus(id, status);
  } catch {}
}

async function syncProducts(qc: QueryClient): Promise<{ synced: number; failed: number }> {
  const pending = (await listPending()).filter((op) => op.type === "product_create");
  let synced = 0;
  let failed = 0;
  for (const op of pending) {
    if (op.id == null) continue;
    await safeUpdateStatus(op.id, "processing");
    try {
      await createProduct(op.payload as ProductInput);
      await dequeue(op.id);
      log("PRODUCT_CREATE_SYNCED", { id: op.id, nombre: (op.payload as ProductInput)?.nombre });
      synced++;
    } catch {
      await safeUpdateStatus(op.id, "pending");
      failed++;
    }
  }
  if (synced > 0) qc.invalidateQueries({ queryKey: ["products"] });
  return { synced, failed };
}

async function syncCategories(qc: QueryClient): Promise<{ synced: number; failed: number }> {
  const pending = (await listPending()).filter((op) => op.type === "category_create");
  let synced = 0;
  let failed = 0;
  for (const op of pending) {
    if (op.id == null) continue;
    await safeUpdateStatus(op.id, "processing");
    try {
      await createCategory(op.payload as { nombre: string });
      await dequeue(op.id);
      log("CATEGORY_CREATE_SYNCED", { id: op.id, nombre: (op.payload as { nombre: string })?.nombre });
      synced++;
    } catch {
      await safeUpdateStatus(op.id, "pending");
      failed++;
    }
  }
  if (synced > 0) {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }
  return { synced, failed };
}

async function syncCustomers(qc: QueryClient): Promise<{ synced: number; failed: number }> {
  const pending = (await listPending()).filter((op) => op.type === "customer_create");
  let synced = 0;
  let failed = 0;
  for (const op of pending) {
    if (op.id == null) continue;
    await safeUpdateStatus(op.id, "processing");
    try {
      await createCustomer(op.payload as CustomerInput);
      await dequeue(op.id);
      log("CUSTOMER_CREATE_SYNCED", { id: op.id, nombre: (op.payload as CustomerInput)?.nombre });
      synced++;
    } catch {
      await safeUpdateStatus(op.id, "pending");
      failed++;
    }
  }
  if (synced > 0) qc.invalidateQueries({ queryKey: ["customers"] });
  return { synced, failed };
}

async function syncSales(qc: QueryClient): Promise<{ synced: number; failed: number }> {
  const pending = (await listPending()).filter((op) => op.type === "sale");
  let synced = 0;
  let failed = 0;
  for (const op of pending) {
    if (op.id == null) continue;
    await safeUpdateStatus(op.id, "processing");
    const p = op.payload as OfflineSalePayload;
    log("SALE_SYNC_START", {
      id: op.id,
      itemCount: p.items?.length,
      client_id: p.client_id,
      customer_id: p.customer_id ?? null,
    });
    try {
      await createSale({
        items: p.items,
        observacion: p.observacion ?? null,
        customer_id: p.customer_id ?? null,
        client_id: p.client_id,
      });
      await dequeue(op.id);
      log("SALE_SYNC_SUCCESS", { id: op.id, itemCount: p.items?.length });
      log("SALE_CREATE_SYNCED", { id: op.id, itemCount: p.items?.length });
      synced++;
    } catch (e) {
      await safeUpdateStatus(op.id, "pending");
      const errMsg = e instanceof Error ? e.message : String(e);
      const errStack = e instanceof Error ? (e.stack ?? null) : null;
      log(
        "SALE_SYNC_ERROR",
        {
          id: op.id,
          error: errMsg,
          stack: errStack,
          items: p.items,
          client_id: p.client_id,
          customer_id: p.customer_id ?? null,
        },
        "error",
      );
      failed++;
    }
  }
  if (synced > 0) {
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["stock_movements"] });
  }
  return { synced, failed };
}

export async function syncAllPending(qc: QueryClient, trigger: "auto" | "manual" = "manual"): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  let toastId: string | number | undefined;
  try {
    if (trigger === "auto") {
      log("AUTO_SYNC_START", { trigger });
    }
    await requeueProcessingOlderThan(10);

    const all = await listPending();
    if (all.length === 0) return;

    log("SYNC_START", { count: all.length });
    toastId = toast.loading(
      `Sincronizando ${all.length} operación${all.length !== 1 ? "es" : ""} pendiente${all.length !== 1 ? "s" : ""}…`,
    );

    const [cats, prods, custs, sales] = await Promise.allSettled([
      syncCategories(qc),
      syncProducts(qc),
      syncCustomers(qc),
      syncSales(qc),
    ]);

    const results = [cats, prods, custs, sales].map((r) =>
      r.status === "fulfilled" ? r.value : { synced: 0, failed: 0 },
    );

    const totalSynced = results.reduce((s, r) => s + r.synced, 0);
    const totalFailed = results.reduce((s, r) => s + r.failed, 0);

    toast.dismiss(toastId);

    if (totalSynced > 0 || totalFailed === 0) {
      log("SYNC_SUCCESS", { synced: totalSynced, failed: totalFailed });
      if (trigger === "auto") log("AUTO_SYNC_SUCCESS", { synced: totalSynced, failed: totalFailed });
    }
    if (totalFailed > 0) {
      log("SYNC_ERROR", { synced: totalSynced, failed: totalFailed }, "warn");
      if (trigger === "auto") log("AUTO_SYNC_ERROR", { synced: totalSynced, failed: totalFailed }, "warn");
    }

    if (totalSynced > 0 && totalFailed === 0) {
      toast.success(
        `${totalSynced} operación${totalSynced !== 1 ? "es" : ""} sincronizada${totalSynced !== 1 ? "s" : ""} correctamente`,
      );
    } else if (totalSynced === 0 && totalFailed > 0) {
      toast.error(
        `${totalFailed} operación${totalFailed !== 1 ? "es" : ""} no pudieron sincronizarse. Se reintentarán al reconectar.`,
      );
    } else if (totalSynced > 0 && totalFailed > 0) {
      toast.warning(
        `${totalSynced} sincronizada${totalSynced !== 1 ? "s" : ""}, ${totalFailed} pendiente${totalFailed !== 1 ? "s" : ""} — se reintentarán al reconectar`,
      );
    }
  } catch {
    toast.dismiss(toastId);
    toast.error("Error al sincronizar operaciones pendientes");
    log("SYNC_ERROR", { message: "uncaught exception in syncAllPending" }, "error");
  } finally {
    isSyncing = false;
  }
}
