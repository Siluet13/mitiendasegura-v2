import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { enqueue, isNetworkError } from "@/lib/offline/queue";
import { log } from "@/lib/offline/logger";
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

function CategoriesPage() {
  const qc = useQueryClient();
  const isOnline = useOnlineStatus();

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
      log("CATEGORY_CREATE_START", { nombre: values.nombre });
      if (!isOnline || !navigator.onLine) {
        await enqueue("category_create", values);
        log("CATEGORY_CREATE_ENQUEUED", { nombre: values.nombre, trigger: "offline" });
        return null;
      }
      try {
        return await createCategory(values);
      } catch (e) {
        if (isNetworkError(e)) {
          await enqueue("category_create", values);
          log("CATEGORY_CREATE_ENQUEUED", { nombre: values.nombre, trigger: "network_error" });
          return null;
        }
        throw e;
      }
    },
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
          <form onSubmit={form.handleSubmit(async (v) => {
            log("MUTATION_START", { entity: "category", editing: !!editing });
            try {
              const result = await saveMut.mutateAsync(v);
              log("MUTATION_SUCCESS", { entity: "category", offline: result === null });
              if (result === null) {
                toast.success("Categoría guardada localmente. Se sincronizará al reconectar.");
              } else {
                qc.invalidateQueries({ queryKey: ["categories"] });
                qc.invalidateQueries({ queryKey: ["products"] });
                toast.success(editing ? "Categoría actualizada" : "Categoría creada");
              }
              log("FORM_RESET", { entity: "category" });
              form.reset({ nombre: "" });
              log("DIALOG_CLOSE", { entity: "category" });
              setOpen(false);
            } catch (e) {
              log("MUTATION_ERROR", { entity: "category", error: String(e) }, "error");
              toast.error(e instanceof Error ? e.message : "Error al guardar");
            } finally {
              log("MUTATION_SETTLED", { entity: "category" });
            }
          })} className="space-y-4">
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
