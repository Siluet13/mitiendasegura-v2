import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, XCircle, Package, ArrowUpCircle } from "lucide-react";
import { getStockAlerts, type StockAlertProduct } from "@/lib/api/stockAlerts";
import { createStockMovement } from "@/lib/api/inventory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/stock-alerts")({
  component: StockAlertsPage,
});

// ── Reponer Stock Dialog ──────────────────────────────────────────────────────
const reponerSchema = z.object({
  cantidad: z.coerce.number().int("Debe ser un número entero").min(1, "Mínimo 1 unidad"),
  observacion: z.string().optional(),
});
type ReponerForm = z.infer<typeof reponerSchema>;

function ReponerDialog({
  product,
  onClose,
}: {
  product: StockAlertProduct | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const form = useForm<ReponerForm>({
    resolver: zodResolver(reponerSchema),
    defaultValues: { cantidad: 1, observacion: "" },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (data: ReponerForm) =>
      createStockMovement({
        product_id: product!.id,
        tipo: "entrada",
        cantidad: data.cantidad,
        observacion: data.observacion || "Reposición desde alertas",
      }),
    onSuccess: () => {
      toast.success(`Stock repuesto para "${product?.nombre}".`);
      qc.invalidateQueries({ queryKey: ["stock_alerts"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Error al reponer stock");
    },
  });

  const onSubmit = (data: ReponerForm) => mutate(data);

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
            Reponer stock
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-2">
          <span className="font-medium text-foreground">{product?.nombre}</span>
          <span className="ml-2">
            — stock actual:{" "}
            <Badge variant={product?.estado === "sin_stock" ? "destructive" : "outline"} className="text-xs">
              {product?.stock}
            </Badge>
            {product && product.stockMinimo > 0 && (
              <span className="ml-1 text-xs">/ mín. {product.stockMinimo}</span>
            )}
          </span>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="cantidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad a ingresar</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} step={1} autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="observacion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observación (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Compra, reposición, ajuste…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando…" : "Reponer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Alert Row ─────────────────────────────────────────────────────────────────
function AlertRow({
  product,
  onReponer,
}: {
  product: StockAlertProduct;
  onReponer: (p: StockAlertProduct) => void;
}) {
  const isSinStock = product.estado === "sin_stock";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
        isSinStock
          ? "border-destructive/30 bg-destructive/5"
          : "border-amber-200 bg-amber-50/60"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {isSinStock ? (
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{product.nombre}</p>
          {product.sku && (
            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right text-sm hidden sm:block">
          <div className="text-muted-foreground text-xs">Stock</div>
          <div className="font-semibold">
            {product.stock}
            {product.stockMinimo > 0 && (
              <span className="font-normal text-muted-foreground"> / mín. {product.stockMinimo}</span>
            )}
          </div>
        </div>
        <Badge
          variant={isSinStock ? "destructive" : "outline"}
          className={!isSinStock ? "text-amber-700 border-amber-300 bg-amber-100" : ""}
        >
          {isSinStock ? "Sin stock" : "Stock bajo"}
        </Badge>
        <Button size="sm" variant="outline" onClick={() => onReponer(product)}>
          <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
          Reponer
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function StockAlertsPage() {
  const [reponerTarget, setReponerTarget] = useState<StockAlertProduct | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["stock_alerts"],
    queryFn: getStockAlerts,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">Centro de Alertas</h1>
          <p className="text-sm text-muted-foreground">
            Productos con stock por debajo del mínimo configurado.
          </p>
        </div>
        {data && data.total > 0 && (
          <Badge variant="destructive" className="ml-auto text-sm px-3">
            {data.total} {data.total === 1 ? "alerta" : "alertas"}
          </Badge>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <p className="text-sm text-destructive">Error al cargar las alertas de stock.</p>
      )}

      {/* Empty state */}
      {data && data.total === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted-foreground">
          <Package className="h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">Sin alertas activas</p>
          <p className="text-sm">Todos los productos tienen stock suficiente.</p>
        </div>
      )}

      {/* Sin stock */}
      {data && data.sinStock.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold text-sm uppercase tracking-wide text-destructive">
              Sin stock
            </h2>
            <Badge variant="destructive" className="text-xs">
              {data.sinStock.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {data.sinStock.map((p) => (
              <AlertRow key={p.id} product={p} onReponer={setReponerTarget} />
            ))}
          </div>
        </section>
      )}

      {/* Stock bajo */}
      {data && data.stockBajo.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-sm uppercase tracking-wide text-amber-700">
              Stock bajo
            </h2>
            <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100 border border-amber-200">
              {data.stockBajo.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {data.stockBajo.map((p) => (
              <AlertRow key={p.id} product={p} onReponer={setReponerTarget} />
            ))}
          </div>
        </section>
      )}

      {/* Reponer dialog */}
      <ReponerDialog
        product={reponerTarget}
        onClose={() => setReponerTarget(null)}
      />
    </div>
  );
}
