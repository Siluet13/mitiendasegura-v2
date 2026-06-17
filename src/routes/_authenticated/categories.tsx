import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, WifiOff } from "lucide-react";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  type Category,
} from "@/lib/api/inventory";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useReconnect } from "@/hooks/useReconnect";
import { enqueue, listPending, dequeue } from "@/lib/offline/queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({ meta: [{ title: "Categorías" }] }),
  component: CategoriesPage,
});

const schema = z.object({
  nombre: z.string().trim().min(1, "Requerido").max(100),
});
type FormValues = z.infer<typeof schema>;

let isSyncing = false;

export async function syncPendingCategories(qc: QueryClient): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  let toastId: string | number | undefined;
  try {
    const pending = await listPending();
    const categoryPending = pending.filter((op) => op.type === "category_create");

    if (categoryPending.length === 0) return;

    toastId = toast.loading(
      `Sincronizando ${categoryPending.length} categoría${categoryPending.length !== 1 ? "s" : ""} pendiente${categoryPending.length !== 1 ? "s" : ""}…`
    );

    let synced = 0;
    let failed = 0;

    for (const op of categoryPending) {
      if (op.id == null) continue;
      try {
        await createCategory(op.payload as { nombre: string });
        await dequeue(op.id);
        synced++;
      } catch {
        failed++;
      }
    }

    toast.dismiss(toastId);

    if (synced > 0) {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    }

    if (synced > 0 && failed === 0) {
      toast.success(
        `${synced} categoría${synced !== 1 ? "s" : ""} sincronizada${synced !== 1 ? "s" : ""} correctamente`
      );
    } else if (synced === 0 && failed > 0) {
      toast.error(
        `${failed} categoría${failed !== 1 ? "s" : ""} no pudo sincronizarse. Se reintentará al reconectar.`
      );
    } else if (synced > 0 && failed > 0) {
      toast.warning(
        `${synced} sincronizada${synced !== 1 ? "s" : ""}, ${failed} pendiente${failed !== 1 ? "s" : ""} — se reintentará al reconectar`
      );
    }
  } catch {
    toast.dismiss(toastId);
    toast.error("Error al sincronizar categorías pendientes");
  } finally {
    isSyncing = false;
  }
}

function CategoriesPage() {
  const qc = useQueryClient();
  const isOnline = useOnlineStatus();
  const handleReconnect = useCallback(() => syncPendingCategories(qc), [qc]);
  useReconnect(handleReconnect);

  const { data = [], isLoading } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nombre: "" },
  });

  function openNew() {
    setEditing(null);
    form.reset({ nombre: "" });
    setOpen(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    form.reset({ nombre: c.nombre });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async (values: FormValues) => {
      if (editing) {
        return updateCategory(editing.id, values);
      }
      if (!isOnline) {
        await enqueue("category_create", values);
        return null;
      }
      return createCategory(values);
    },
    onSuccess: (result) => {
      if (result === null) {
        toast.success("Categoría guardada localmente. Se sincronizará al reconectar.");
        setOpen(false);
        return;
      }
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(editing ? "Categoría actualizada" : "Categoría creada");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Categoría eliminada");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Categorías</h1>
          {!isOnline && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <WifiOff className="h-4 w-4" /> Offline
            </span>
          )}
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-32 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground">Sin categorías</TableCell></TableRow>
            ) : (
              data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.nombre}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMut.mutate(v))} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" {...form.register("nombre")} autoFocus />
              {form.formState.errors.nombre && (
                <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
              )}
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
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Los productos asociados quedarán sin categoría. Esta acción no se puede deshacer.
            </AlertDialogDescription>
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
