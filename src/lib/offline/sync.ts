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

type OfflineSalePayload = {
  items: SaleItemInput[];
  observacion?: string | null;
  customer_id?: string | null;
  client_id: string;
};

let isSyncing = false;

async function syncProducts(qc: QueryClient): Promise<{ synced: number; failed: number }> {
  const pending = (await listPending()).filter((op) => op.type === "product_create");
  let synced = 0;
  let failed = 0;
  for (const op of pending) {
    if (op.id == null) continue;
    await updateStatus(op.id, "processing");
    try {
      await createProduct(op.payload as ProductInput);
      await dequeue(op.id);
      synced++;
    } catch {
      await updateStatus(op.id, "pending");
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
    await updateStatus(op.id, "processing");
    try {
      await createCategory(op.payload as { nombre: string });
      await dequeue(op.id);
      synced++;
    } catch {
      await updateStatus(op.id, "pending");
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
    await updateStatus(op.id, "processing");
    try {
      await createCustomer(op.payload as CustomerInput);
      await dequeue(op.id);
      synced++;
    } catch {
      await updateStatus(op.id, "pending");
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
    await updateStatus(op.id, "processing");
    const p = op.payload as OfflineSalePayload;
    try {
      await createSale({
        items: p.items,
        observacion: p.observacion ?? null,
        customer_id: p.customer_id ?? null,
        client_id: p.client_id,
      });
      await dequeue(op.id);
      synced++;
    } catch {
      await updateStatus(op.id, "pending");
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

export async function syncAllPending(qc: QueryClient): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  let toastId: string | number | undefined;
  try {
    await requeueProcessingOlderThan(10);

    const all = await listPending();
    if (all.length === 0) return;

    toastId = toast.loading(`Sincronizando ${all.length} operación${all.length !== 1 ? "es" : ""} pendiente${all.length !== 1 ? "s" : ""}…`);

    const [cats, prods, custs, sales] = await Promise.all([
      syncCategories(qc),
      syncProducts(qc),
      syncCustomers(qc),
      syncSales(qc),
    ]);

    const totalSynced = cats.synced + prods.synced + custs.synced + sales.synced;
    const totalFailed = cats.failed + prods.failed + custs.failed + sales.failed;

    toast.dismiss(toastId);

    if (totalSynced > 0 && totalFailed === 0) {
      toast.success(`${totalSynced} operación${totalSynced !== 1 ? "es" : ""} sincronizada${totalSynced !== 1 ? "s" : ""} correctamente`);
    } else if (totalSynced === 0 && totalFailed > 0) {
      toast.error(`${totalFailed} operación${totalFailed !== 1 ? "es" : ""} no pudieron sincronizarse. Se reintentarán al reconectar.`);
    } else if (totalSynced > 0 && totalFailed > 0) {
      toast.warning(`${totalSynced} sincronizada${totalSynced !== 1 ? "s" : ""}, ${totalFailed} pendiente${totalFailed !== 1 ? "s" : ""} — se reintentarán al reconectar`);
    }
  } catch {
    toast.dismiss(toastId);
    toast.error("Error al sincronizar operaciones pendientes");
  } finally {
    isSyncing = false;
  }
}
