import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Plus } from "lucide-react";
import {
  createStockMovement,
  listProducts,
  listStockMovements,
  type StockMovementInput,
} from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/stock-movements")({
  head: () => ({ meta: [{ title: "Movimientos de stock" }] }),
  component: StockMovementsPage,
});

const ALL = "__all__";

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
  const [open, setOpen] = useState(false);

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["stock_movements", filterProduct],
    queryFn: () => listStockMovements({ productId: filterProduct === ALL ? null : filterProduct }),
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  function openNew() {
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
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Movimientos de stock</h1>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo movimiento
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por producto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los productos</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Observación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : movements.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Sin movimientos</TableCell></TableRow>
            ) : (
              movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(m.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">
                    {m.products?.nombre ?? "—"}
                    {m.products?.sku ? <span className="ml-1 text-xs text-muted-foreground">({m.products.sku})</span> : null}
                  </TableCell>
                  <TableCell>
                    {m.tipo === "entrada" ? (
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
                    {m.observacion ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo movimiento</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMut.mutate(v))} className="space-y-4">
            <div className="space-y-2">
              <Label>Producto</Label>
              <Select
                value={form.watch("product_id") || undefined}
                onValueChange={(v) => form.setValue("product_id", v, { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre} <span className="text-xs text-muted-foreground">· stock {p.stock}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.product_id && (
                <p className="text-sm text-destructive">{form.formState.errors.product_id.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.watch("tipo")}
                  onValueChange={(v) => form.setValue("tipo", v as "entrada" | "salida")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="salida">Salida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad</Label>
                <Input id="cantidad" type="number" min="1" step="1" {...form.register("cantidad")} />
                {form.formState.errors.cantidad && (
                  <p className="text-sm text-destructive">{form.formState.errors.cantidad.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacion">Observación</Label>
              <Textarea id="observacion" rows={3} {...form.register("observacion")} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Guardando..." : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
