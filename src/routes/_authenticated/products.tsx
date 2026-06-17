import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Search, WifiOff } from "lucide-react";
import {
  createProduct,
  deleteProduct,
  listCategories,
  listProducts,
  updateProduct,
  type Product,
  type ProductInput,
} from "@/lib/api/inventory";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useReconnect } from "@/hooks/useReconnect";
import { enqueue, listPending, dequeue } from "@/lib/offline/queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Productos" }] }),
  component: ProductsPage,
});

const NO_CAT = "__none__";
const ALL_CAT = "__all__";

const schema = z.object({
  nombre: z.string().trim().min(1, "Requerido").max(200),
  descripcion: z.string().trim().max(1000).optional().or(z.literal("")),
  sku: z.string().trim().max(100).optional().or(z.literal("")),
  codigo_barras: z.string().trim().max(100).optional().or(z.literal("")),
  precio: z.coerce.number().min(0, "Debe ser ≥ 0"),
  costo: z.coerce.number().min(0, "Debe ser ≥ 0"),
  stock: z.coerce.number().int().min(0, "Debe ser ≥ 0"),
  stock_minimo: z.coerce.number().int().min(0, "Debe ser ≥ 0"),
  category_id: z.string().optional(),
  activo: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const defaults: FormValues = {
  nombre: "",
  descripcion: "",
  sku: "",
  codigo_barras: "",
  precio: 0,
  costo: 0,
  stock: 0,
  stock_minimo: 0,
  category_id: NO_CAT,
  activo: true,
};

let isSyncing = false;

export async function syncPendingProducts(qc: QueryClient): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  let toastId: string | number | undefined;
  try {
    const pending = await listPending();
    const productPending = pending.filter((op) => op.type === "product_create");

    if (productPending.length === 0) return;

    toastId = toast.loading(
      `Sincronizando ${productPending.length} producto${productPending.length !== 1 ? "s" : ""} pendiente${productPending.length !== 1 ? "s" : ""}…`
    );

    let synced = 0;
    let failed = 0;

    for (const op of productPending) {
      if (op.id == null) continue;
      try {
        await createProduct(op.payload as ProductInput);
        await dequeue(op.id);
        synced++;
      } catch {
        failed++;
      }
    }

    toast.dismiss(toastId);

    if (synced > 0) {
      qc.invalidateQueries({ queryKey: ["products"] });
    }

    if (synced > 0 && failed === 0) {
      toast.success(
        `${synced} producto${synced !== 1 ? "s" : ""} sincronizado${synced !== 1 ? "s" : ""} correctamente`
      );
    } else if (synced === 0 && failed > 0) {
      toast.error(
        `${failed} producto${failed !== 1 ? "s" : ""} no pudo sincronizarse. Se reintentará al reconectar.`
      );
    } else if (synced > 0 && failed > 0) {
      toast.warning(
        `${synced} sincronizado${synced !== 1 ? "s" : ""}, ${failed} pendiente${failed !== 1 ? "s" : ""} — se reintentará al reconectar`
      );
    }
  } catch {
    toast.dismiss(toastId);
    toast.error("Error al sincronizar productos pendientes");
  } finally {
    isSyncing = false;
  }
}

function ProductsPage() {
  const qc = useQueryClient();
  const isOnline = useOnlineStatus();
  const handleReconnect = useCallback(() => syncPendingProducts(qc), [qc]);
  useReconnect(handleReconnect);

  const { data: products = [], isLoading } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>(ALL_CAT);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== ALL_CAT) {
        if (catFilter === NO_CAT) {
          if (p.category_id) return false;
        } else if (p.category_id !== catFilter) return false;
      }
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        ((p as Product & { codigo_barras?: string | null }).codigo_barras ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, catFilter]);

  function openNew() {
    setEditing(null);
    form.reset(defaults);
    setOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    const ext = p as Product & { codigo_barras?: string | null; costo?: number | string };
    form.reset({
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      sku: p.sku ?? "",
      codigo_barras: ext.codigo_barras ?? "",
      precio: Number(p.precio),
      costo: Number(ext.costo ?? 0),
      stock: p.stock,
      stock_minimo: p.stock_minimo,
      category_id: p.category_id ?? NO_CAT,
      activo: p.activo,
    });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: ProductInput = {
        nombre: values.nombre,
        descripcion: values.descripcion?.trim() ? values.descripcion : null,
        sku: values.sku?.trim() ? values.sku : null,
        codigo_barras: values.codigo_barras?.trim() ? values.codigo_barras : null,
        precio: values.precio,
        costo: values.costo,
        stock: values.stock,
        stock_minimo: values.stock_minimo,
        category_id: values.category_id && values.category_id !== NO_CAT ? values.category_id : null,
        activo: values.activo,
      };
      if (editing) {
        return updateProduct(editing.id, payload);
      }
      if (!isOnline) {
        await enqueue("product_create", payload);
        return null;
      }
      return createProduct(payload);
    },
    onSuccess: (result) => {
      if (result === null) {
        toast.success("Producto guardado localmente. Se sincronizará al reconectar.");
        setOpen(false);
        return;
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(editing ? "Producto actualizado" : "Producto creado");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Producto eliminado");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Productos</h1>
          {!isOnline && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <WifiOff className="h-4 w-4" /> Offline
            </span>
          )}
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nombre, SKU o código de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Filtrar por categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CAT}>Todas las categorías</SelectItem>
            <SelectItem value={NO_CAT}>Sin categoría</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Cód. barras</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-32 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Sin productos</TableCell></TableRow>
            ) : (
              filtered.map((p) => {
                const ext = p as Product & { codigo_barras?: string | null; costo?: number | string };
                const low = p.stock <= p.stock_minimo;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell className="text-muted-foreground">{p.sku ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{ext.codigo_barras ?? "—"}</TableCell>
                    <TableCell>{p.categories?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(ext.costo ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(p.precio).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={low ? "text-destructive font-medium" : undefined}>{p.stock}</span>
                    </TableCell>
                    <TableCell>
                      {p.activo ? (
                        <Badge variant="default">Activo</Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleting(p)}>
                          <Trash2 className="h-4 w-4" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMut.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" {...form.register("nombre")} autoFocus />
                {form.formState.errors.nombre && (
                  <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" {...form.register("sku")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigo_barras">Código de barras</Label>
                <Input id="codigo_barras" {...form.register("codigo_barras")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Categoría</Label>
                <Select
                  value={form.watch("category_id") ?? NO_CAT}
                  onValueChange={(v) => form.setValue("category_id", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CAT}>Sin categoría</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="costo">Costo</Label>
                <Input id="costo" type="number" step="0.01" min="0" {...form.register("costo")} />
                {form.formState.errors.costo && (
                  <p className="text-sm text-destructive">{form.formState.errors.costo.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="precio">Precio</Label>
                <Input id="precio" type="number" step="0.01" min="0" {...form.register("precio")} />
                {form.formState.errors.precio && (
                  <p className="text-sm text-destructive">{form.formState.errors.precio.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock">Stock</Label>
                <Input id="stock" type="number" min="0" {...form.register("stock")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock_minimo">Stock mínimo</Label>
                <Input id="stock_minimo" type="number" min="0" {...form.register("stock_minimo")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea id="descripcion" rows={3} {...form.register("descripcion")} />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  id="activo"
                  checked={form.watch("activo")}
                  onCheckedChange={(c) => form.setValue("activo", c)}
                />
                <Label htmlFor="activo">Activo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && delMut.mutate(deleting.id)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
