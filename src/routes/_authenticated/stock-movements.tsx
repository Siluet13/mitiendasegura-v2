import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Ban, Plus, Search } from "lucide-react";
import {
  createStockMovement,
  listProducts,
  listStockMovements,
  voidStockMovement,
  type StockMovementInput,
} from "@/lib/api/inventory";
import { log } from "@/lib/offline/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/stock-movements")({
  head: () => ({ meta: [{ title: "Movimientos de stock" }] }),
  component: StockMovementsPage,
});

const ALL = "__all__";
const DEBOUNCE_MS = 350;

const schema = z.object({
  product_id: z.string().uuid("Seleccioná un producto"),
  tipo: z.enum(["entrada", "salida"]),
  cantidad: z.coerce.number().int().positive("Debe ser mayor a 0"),
  observacion: z.string().trim().max(500).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

const defaults: FormValues = {
  product_id: "",
  tipo: "entrada",
  cantidad: 1,
  observacion: "",
};

function StockMovementsPage() {
  const qc = useQueryClient();
  const [filterProduct, setFilterProduct] = useState<string>(ALL);
  const [searchText, setSearchText] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  // Debounce the search text → debouncedQ drives the query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(searchText.trim());
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: listProducts,
  });

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["stock_movements", filterProduct, debouncedQ],
    queryFn: () =>
      listStockMovements({
        productId: filterProduct === ALL ? null : filterProduct,
        q: debouncedQ || undefined,
      }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  function openNew() {
    log("FORM_OPEN", {
      entity: "stock_movement",
      isPending: saveMut.isPending,
      status: saveMut.status,
      isSuccess: saveMut.isSuccess,
      isError: saveMut.isError,
    });
    if (saveMut.status !== "idle")
      log("FORM_REOPEN", {
        entity: "stock_movement",
        isPending: saveMut.isPending,
        status: saveMut.status,
      });
    form.reset(defaults);
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: StockMovementInput = {
        product_id: values.product_id,
        tipo: values.tipo,
        cantidad: values.cantidad,
        observacion: values.observacion?.trim() ? values.observacion : null,
      };
      return createStockMovement(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Movimiento registrado");
      log("MUTATION_SETTLED", {
        entity: "stock_movement",
        isPending: saveMut.isPending,
        status: saveMut.status,
      });
      log("FORM_CLOSE", {
        entity: "stock_movement",
        isPending: saveMut.isPending,
        status: saveMut.status,
        open,
      });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => voidStockMovement(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Movimiento anulado");
      setVoidingId(null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setVoidingId(null);
    },
  });

  useEffect(() => {
    log("MUTATION_STATE_CHANGE", {
      entity: "stock_movement",
      isPending: saveMut.isPending,
      status: saveMut.status,
      isSuccess: saveMut.isSuccess,
      isError: saveMut.isError,
    });
  }, [saveMut.isPending, saveMut.status, saveMut.isSuccess, saveMut.isError]);

  const isSaleMovement = (referenciaTipo: string | null) =>
    referenciaTipo === "sale" ||
    referenciaTipo === "sale_edit" ||
    referenciaTipo === "sale_void";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Movimientos de stock</h1>
        <Button onClick={openNew} className="gap-2" disabled={saveMut.isPending}>
          <Plus className="h-4 w-4" /> Nuevo movimiento
        </Button>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nombre, SKU, cód. barras o categoría…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="sm:w-64">
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por producto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los productos</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────────────── */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Observación</TableHead>
              <TableHead className="w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : movements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Sin movimientos
                </TableCell>
              </TableRow>
            ) : (
              movements.map((m) => {
                const isVoided = !!m.voidedAt;
                const canVoid = !isVoided && !isSaleMovement(m.referenciaTipo);
                return (
                  <TableRow key={m.id} className={isVoided ? "opacity-50" : undefined}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className={["font-medium", isVoided ? "line-through" : ""].join(" ")}>
                      {m.products?.nombre ?? "—"}
                      {m.products?.sku ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({m.products.sku})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {isVoided ? (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          <Ban className="h-3 w-3" /> Anulado
                        </Badge>
                      ) : m.tipo === "entrada" ? (
                        <Badge variant="default" className="gap-1">
                          <ArrowDownToLine className="h-3 w-3" /> Entrada
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <ArrowUpFromLine className="h-3 w-3" /> Salida
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.cantidad}</TableCell>
                    <TableCell className="max-w-[24rem] truncate text-sm text-muted-foreground">
                      {isVoided && m.voidReason ? (
                        <span className="text-destructive/70">[Anulado: {m.voidReason}]</span>
                      ) : (
                        m.observacion ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {canVoid && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Anular movimiento"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setVoidingId(m.id)}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Nuevo movimiento ─────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo movimiento</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit((v) => {
              log("MUTATION_BEFORE_AWAIT", {
                entity: "stock_movement",
                isPending: saveMut.isPending,
                status: saveMut.status,
              });
              saveMut.mutate(v);
            })}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Producto</Label>
              <Select
                value={form.watch("product_id") || undefined}
                onValueChange={(v) =>
                  form.setValue("product_id", v, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}{" "}
                      <span className="text-xs text-muted-foreground">
                        · stock {p.stock}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.product_id && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.product_id.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.watch("tipo")}
                  onValueChange={(v) =>
                    form.setValue("tipo", v as "entrada" | "salida")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="salida">Salida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad</Label>
                <Input
                  id="cantidad"
                  type="number"
                  min="1"
                  step="1"
                  {...form.register("cantidad")}
                />
                {form.formState.errors.cantidad && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.cantidad.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacion">Observación</Label>
              <Textarea id="observacion" rows={3} {...form.register("observacion")} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Guardando..." : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Confirmar anulación ───────────────────────────────────────────── */}
      <AlertDialog
        open={!!voidingId}
        onOpenChange={(v) => {
          if (!v) setVoidingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              El stock del producto se recalculará automáticamente. Esta acción no
              puede deshacerse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => voidingId && voidMut.mutate(voidingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Anular movimiento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
