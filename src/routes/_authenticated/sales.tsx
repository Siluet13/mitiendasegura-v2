import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, Eye, User, WifiOff, Printer } from "lucide-react";
import {
  createSale,
  getSaleWithItems,
  listCustomers,
  listProducts,
  listSales,
  type Customer,
  type Product,
  type SaleItemInput,
} from "@/lib/api/inventory";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueue, isNetworkError } from "@/lib/offline/queue";
import { log } from "@/lib/offline/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PosScannerInput,
  type PosScannerInputHandle,
} from "@/components/sales/PosScannerInput";
import { LastScannedPanel } from "@/components/sales/LastScannedPanel";
import { ReceiptDialog } from "@/components/receipts/ReceiptDialog";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({ meta: [{ title: "Ventas" }] }),
  component: SalesPage,
});


const obsSchema = z.string().trim().max(500).optional().or(z.literal(""));
const NO_CUSTOMER = "__none__";

type Line = { product_id: string; cantidad: number };

type OfflineSalePayload = {
  items: SaleItemInput[];
  observacion?: string | null;
  customer_id?: string | null;
  client_id: string;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

// ── Small keyboard badge ───────────────────────────────────────────────────────
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function SalesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState<{
    saleId: string;
    receiptNumber: string | null;
    customerId: string | null;
    skipAutoActions: boolean;
  } | null>(null);

  const { data: sales = [], isLoading } = useQuery({ queryKey: ["sales"], queryFn: listSales });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: listCustomers,
    retry: false,
  });

  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers) m.set(c.id, c.nombre);
    return m;
  }, [customers]);

  // F5 opens a new sale from the list view
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (open || detailId) return;
      if (e.key === "F5") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, detailId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Ventas</h1>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nueva venta
          <Kbd>F5</Kbd>
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Observación</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Sin ventas
                </TableCell>
              </TableRow>
            ) : (
              sales.map((s) => {
                const clienteNombre = s.customerId ? customerMap.get(s.customerId) : undefined;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {clienteNombre ? (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {clienteNombre}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmt(Number(s.total))}
                    </TableCell>
                    <TableCell className="max-w-[20rem] truncate text-sm text-muted-foreground">
                      {s.observacion ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Reimprimir comprobante"
                          onClick={() =>
                            setPendingReceipt({
                              saleId: s.id,
                              receiptNumber: s.receiptNumber,
                              customerId: s.customerId,
                              skipAutoActions: true,
                            })
                          }
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDetailId(s.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <NewSaleDialog
        open={open}
        onOpenChange={setOpen}
        products={products}
        customers={customers}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["sales"] });
          qc.invalidateQueries({ queryKey: ["products"] });
          qc.invalidateQueries({ queryKey: ["stock_movements"] });
        }}
        onSaleCompleted={(saleId, receiptNumber, cid) => {
          setPendingReceipt({ saleId, receiptNumber, customerId: cid, skipAutoActions: false });
        }}
      />

      <SaleDetailDialog id={detailId} onClose={() => setDetailId(null)} customerMap={customerMap} />

      <ReceiptDialog
        saleId={pendingReceipt?.saleId ?? null}
        receiptNumber={pendingReceipt?.receiptNumber ?? null}
        customerName={
          pendingReceipt?.customerId
            ? (customerMap.get(pendingReceipt.customerId) ?? null)
            : null
        }
        skipAutoActions={pendingReceipt?.skipAutoActions ?? false}
        onClose={() => setPendingReceipt(null)}
      />
    </div>
  );
}

// ── New sale dialog ────────────────────────────────────────────────────────────
function NewSaleDialog({
  open,
  onOpenChange,
  products,
  customers,
  onCreated,
  onSaleCompleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  customers: Customer[];
  onCreated: () => void;
  onSaleCompleted?: (saleId: string, receiptNumber: string | null, customerId: string | null) => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [pid, setPid] = useState<string>("");
  const [qty, setQty] = useState<number>(1);
  const [customerId, setCustomerId] = useState<string>(NO_CUSTOMER);
  const [lastScanned, setLastScanned] = useState<{ product: Product; timestamp: number } | null>(null);

  // Refs for keyboard navigation
  const scannerRef = useRef<PosScannerInputHandle>(null);
  const customerTriggerRef = useRef<HTMLButtonElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const form = useForm<{ observacion?: string }>({
    resolver: zodResolver(z.object({ observacion: obsSchema })),
    defaultValues: { observacion: "" },
  });

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const isOnline = useOnlineStatus();

  const available = useMemo(
    () => products.filter((p) => p.activo && !lines.some((l) => l.product_id === p.id)),
    [products, lines],
  );

  const total = useMemo(
    () =>
      lines.reduce((acc, l) => {
        const p = productMap.get(l.product_id);
        return acc + (p ? Number(p.precio) * l.cantidad : 0);
      }, 0),
    [lines, productMap],
  );

  // Derived values for the LastScannedPanel — recomputed each render when lines change
  const lastScannedQty = lastScanned
    ? (lines.find((l) => l.product_id === lastScanned.product.id)?.cantidad ?? 0)
    : 0;
  const lastScannedRemaining = lastScanned
    ? lastScanned.product.stock - lastScannedQty
    : 0;

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  // F2  → foco al scanner
  // F4  → abrir selector de cliente
  // F8  → confirmar venta
  // ESC → cancelar (handled natively by Dialog/Radix)
  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      // Don't intercept when a Radix dropdown/select is open
      if (
        document.querySelector("[data-radix-select-content]") ||
        document.querySelector("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }

      switch (e.key) {
        case "F2":
          e.preventDefault();
          scannerRef.current?.focus();
          break;
        case "F4":
          e.preventDefault();
          customerTriggerRef.current?.focus();
          customerTriggerRef.current?.click();
          break;
        case "F8":
          e.preventDefault();
          submitBtnRef.current?.click();
          break;
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // ── Manual add ───────────────────────────────────────────────────────────────
  function addLine() {
    if (!pid) { toast.error("Seleccioná un producto"); return; }
    if (qty <= 0 || !Number.isInteger(qty)) { toast.error("Cantidad inválida"); return; }
    const p = productMap.get(pid);
    if (!p) return;
    if (qty > p.stock) { toast.error(`Stock insuficiente (disponible: ${p.stock})`); return; }
    setLines((prev) => [...prev, { product_id: pid, cantidad: qty }]);
    setPid("");
    setQty(1);
  }

  // ── POS scanner add ──────────────────────────────────────────────────────────
  // • Already in cart  → increment cantidad
  // • Not in cart      → add with cantidad = 1
  // • Stock exhausted  → toast, no change
  const addByBarcode = useCallback(
    (product: Product) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.product_id === product.id);
        if (existing) {
          const newQty = existing.cantidad + 1;
          if (newQty > product.stock) {
            toast.error(
              `Stock insuficiente para "${product.nombre}" (disponible: ${product.stock})`,
            );
            return prev;
          }
          return prev.map((l) =>
            l.product_id === product.id ? { ...l, cantidad: newQty } : l,
          );
        }
        if (product.stock < 1) {
          toast.error(`"${product.nombre}" no tiene stock disponible`);
          return prev;
        }
        return [...prev, { product_id: product.id, cantidad: 1 }];
      });
      // Track last scanned for the panel — timestamp drives re-animation on repeat scans
      setLastScanned({ product, timestamp: Date.now() });
    },
    [],
  );

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.product_id !== id));
  }

  const mut = useMutation({
    mutationFn: async (values: { observacion?: string }) => {
      if (lines.length === 0) throw new Error("La venta no puede estar vacía");
      const clientId = crypto.randomUUID();
      const saleInput = {
        items: lines,
        observacion: values.observacion?.trim() ? values.observacion : null,
        customer_id: customerId !== NO_CUSTOMER ? customerId : null,
        client_id: clientId,
      };
      const offlinePayload: OfflineSalePayload & { items_snapshot: unknown[]; total: number } = {
        items: saleInput.items,
        observacion: saleInput.observacion,
        customer_id: saleInput.customer_id,
        client_id: clientId,
        items_snapshot: lines.map((l) => ({
          product_id: l.product_id,
          cantidad: l.cantidad,
          nombre: productMap.get(l.product_id)?.nombre ?? null,
          precioUnitario: productMap.get(l.product_id)?.precio ?? null,
        })),
        total,
      };
      log("SALE_CREATE_START", { itemCount: lines.length, total });
      if (!isOnline || !navigator.onLine) {
        await enqueue("sale", offlinePayload);
        log("SALE_CREATE_ENQUEUED", { itemCount: lines.length, trigger: "offline" });
        return { offline: true as const };
      }
      try {
        const saleResult = await createSale(saleInput);
        return { offline: false as const, saleId: saleResult.id, receiptNumber: saleResult.receiptNumber };
      } catch (e) {
        if (isNetworkError(e)) {
          await enqueue("sale", offlinePayload);
          log("SALE_CREATE_ENQUEUED", { itemCount: lines.length, trigger: "network_error" });
          return { offline: true as const };
        }
        throw e;
      }
    },
  });

  useEffect(() => {
    if (open) {
      const label = mut.status !== "idle" ? "FORM_REOPEN" : "FORM_OPEN";
      log(label, { entity: "sale", isPending: mut.isPending, status: mut.status, isSuccess: mut.isSuccess, isError: mut.isError });
    }
  }, [open, mut.status]);

  useEffect(() => {
    log("MUTATION_STATE_CHANGE", { entity: "sale", isPending: mut.isPending, status: mut.status, isSuccess: mut.isSuccess, isError: mut.isError });
  }, [mut.isPending, mut.status, mut.isSuccess, mut.isError]);

  // BUG #1 FIX: handleOpenChange is the single exit point for closing the dialog.
  // It resets all local state AND resets the mutation (mut.reset()), preventing
  // isPending from staying true if the dialog reopens before TQ commits the update.
  // The form submit now calls handleOpenChange(false) instead of onOpenChange(false)
  // directly, so this cleanup always runs on close regardless of how it's triggered.
  function handleOpenChange(v: boolean) {
    if (!v) {
      log("SALE_DIALOG_CLOSE", { isPending: mut.isPending });
      log("FORM_CLOSE", { entity: "sale", isPending: mut.isPending, status: mut.status, open });
      setLines([]);
      setPid("");
      setQty(1);
      setCustomerId(NO_CUSTOMER);
      setLastScanned(null);
      form.reset({ observacion: "" });
      if (!mut.isPending) mut.reset();
      log("SALE_DIALOG_CLOSED", {});
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Nueva venta</span>
            {/* Shortcut legend */}
            <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <Kbd>F2</Kbd> scanner
              {customers.length > 0 && <><Kbd>F4</Kbd> cliente</>}
              <Kbd>F8</Kbd> cobrar
              <Kbd>ESC</Kbd> cancelar
            </span>
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(async (v) => {
            log("MUTATION_START", { entity: "sale", itemCount: lines.length });
            try {
              log("MUTATION_BEFORE_AWAIT", { entity: "sale", isPending: mut.isPending, status: mut.status });
              const result = await mut.mutateAsync(v);
              log("MUTATION_AFTER_AWAIT", { entity: "sale", isPending: mut.isPending, status: mut.status });
              log("SALE_MUTATION_SUCCESS", { offline: result.offline });
              if (result.offline) {
                toast.info("Venta guardada localmente. Se sincronizará cuando vuelva la conexión.");
              } else {
                toast.success("Venta registrada");
                onCreated();
                onSaleCompleted?.(
                  result.saleId,
                  result.receiptNumber,
                  customerId !== NO_CUSTOMER ? customerId : null,
                );
              }
              log("FORM_RESET", { entity: "sale" });
              // BUG #1 FIX: use handleOpenChange instead of onOpenChange directly.
              // This guarantees local state + mut.reset() always run on close,
              // regardless of whether Radix fires onOpenChange via the prop change.
              handleOpenChange(false);
            } catch (e) {
              log("MUTATION_ERROR", { entity: "sale", error: String(e) }, "error");
              toast.error(e instanceof Error ? e.message : "Error al registrar venta");
            } finally {
              log("SALE_MUTATION_SETTLED", { entity: "sale", isPending: mut.isPending, status: mut.status });
            }
          })}
          className="flex flex-col gap-4 overflow-y-auto pr-1"
        >
          {/* ── POS Scanner ───────────────────────────────────────────────── */}
          <PosScannerInput
            ref={scannerRef}
            products={products}
            onProductFound={addByBarcode}
            isActive={open}
          />

          {/* ── Último artículo escaneado ──────────────────────────────────── */}
          {lastScanned && lastScannedQty > 0 && (
            <LastScannedPanel
              key={lastScanned.timestamp}
              product={lastScanned.product}
              currentQty={lastScannedQty}
              remainingStock={lastScannedRemaining}
            />
          )}

          {/* ── Cliente ───────────────────────────────────────────────────── */}
          {customers.length > 0 && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                Cliente (opcional)
                <Kbd>F4</Kbd>
              </Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger ref={customerTriggerRef}>
                  <SelectValue placeholder="Sin cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOMER}>Sin cliente</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                      {c.telefono && (
                        <span className="text-xs text-muted-foreground"> · {c.telefono}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Selector manual de producto ───────────────────────────────── */}
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
            <div className="space-y-1">
              <Label>Producto</Label>
              <Select value={pid || undefined} onValueChange={setPid}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto" />
                </SelectTrigger>
                <SelectContent>
                  {available.length === 0 ? (
                    <div className="px-2 py-1 text-sm text-muted-foreground">
                      Sin productos disponibles
                    </div>
                  ) : (
                    available.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}{" "}
                        <span className="text-xs text-muted-foreground">
                          · {fmt(Number(p.precio))} · stock {p.stock}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qty">Cantidad</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value || "0", 10))}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={addLine} className="w-full sm:w-auto">
                Agregar
              </Button>
            </div>
          </div>

          {/* ── Carrito ───────────────────────────────────────────────────── */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Escaneá o seleccioná productos para agregar
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((l) => {
                    const p = productMap.get(l.product_id);
                    const precio = p ? Number(p.precio) : 0;
                    return (
                      <TableRow key={l.product_id}>
                        <TableCell className="font-medium">{p?.nombre ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(precio)}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.cantidad}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmt(precio * l.cantidad)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeLine(l.product_id)}
                            aria-label={`Quitar ${p?.nombre ?? "producto"}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* ── Total destacado ───────────────────────────────────────────── */}
          <div className="flex items-center justify-between rounded-lg border-2 border-primary/25 bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Total a cobrar
            </span>
            <span
              className={[
                "tabular-nums font-bold tracking-tight transition-all",
                lines.length > 0
                  ? "text-2xl text-primary"
                  : "text-base text-muted-foreground",
              ].join(" ")}
            >
              {fmt(total)}
            </span>
          </div>

          {/* ── Observación ───────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="observacion">Observación</Label>
            <Textarea id="observacion" rows={2} {...form.register("observacion")} />
          </div>

          {!isOnline && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600">
              <WifiOff className="h-3 w-3" />
              Sin conexión — la venta se guardará localmente
            </p>
          )}

          <DialogFooter className="shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar <Kbd>ESC</Kbd>
            </Button>
            <Button
              ref={submitBtnRef}
              type="submit"
              disabled={mut.isPending || lines.length === 0}
              className="gap-2"
            >
              {mut.isPending ? "Guardando…" : "Confirmar venta"}
              {!mut.isPending && <Kbd>F8</Kbd>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Sale detail dialog ─────────────────────────────────────────────────────────
function SaleDetailDialog({
  id,
  onClose,
  customerMap,
}: {
  id: string | null;
  onClose: () => void;
  customerMap: Map<string, string>;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["sales", id],
    queryFn: () => (id ? getSaleWithItems(id) : Promise.resolve(null)),
    enabled: !!id,
  });

  const clienteNombre = data?.customerId ? customerMap.get(data.customerId) : undefined;

  return (
    <Dialog open={!!id} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalle de venta</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {new Date(data.createdAt).toLocaleString()}
              </span>
              {clienteNombre && (
                <span className="flex items-center gap-1 font-medium">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {clienteNombre}
                </span>
              )}
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Precio unit.</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.sale_items ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.products?.nombre ?? item.productId}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(Number(item.precioUnitario))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.cantidad}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmt(Number(item.subtotal))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end">
              <span className="text-lg font-bold tabular-nums">
                Total: {fmt(Number(data.total))}
              </span>
            </div>
            {data.observacion && (
              <p className="text-sm text-muted-foreground">
                Observación: {data.observacion}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
