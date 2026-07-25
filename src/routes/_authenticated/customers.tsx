import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Pencil, Plus, Trash2, Search, Users, WifiOff,
  Wallet, TrendingUp, TrendingDown, RotateCcw, ArrowUpDown,
  AlertCircle, Banknote, ArrowLeftRight,
} from "lucide-react";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
  getCustomerAccount,
  registerCustomerPayment,
  ConflictError,
  type Customer,
  type CustomerInput,
  type CustomerAccountMovement,
} from "@/lib/api/inventory";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueue, isNetworkError } from "@/lib/offline/queue";
import { log } from "@/lib/offline/logger";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Clientes" }] }),
  component: CustomersPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat("es-AR", {
  style: "decimal",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format;

function fmtMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return isNaN(n) ? "$ 0,00" : `$ ${fmt(n)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function movementLabel(type: CustomerAccountMovement["type"]): string {
  switch (type) {
    case "sale": return "Venta fiada";
    case "payment": return "Pago";
    case "sale_void": return "Anulación de venta";
    case "sale_edit": return "Edición de venta";
    case "adjustment": return "Ajuste";
    default: return type;
  }
}

function MovementIcon({ type }: { type: CustomerAccountMovement["type"] }) {
  switch (type) {
    case "sale":
    case "sale_edit":
      return <TrendingUp className="h-3.5 w-3.5 text-destructive" />;
    case "payment":
      return <TrendingDown className="h-3.5 w-3.5 text-green-600" />;
    case "sale_void":
      return <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// ── Customer Account Schemas ──────────────────────────────────────────────────
const schema = z.object({
  nombre: z.string().trim().min(1, "El nombre es requerido").max(200),
  telefono: z.string().trim().max(50).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: "Email inválido" },
    ),
  direccion: z.string().trim().max(500).optional().or(z.literal("")),
  observaciones: z.string().trim().max(1000).optional().or(z.literal("")),
});

const paymentSchema = z.object({
  amount: z.string().refine((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }, "El importe debe ser mayor a cero"),
  observacion: z.string().trim().max(500).optional().or(z.literal("")),
  payment_method: z.enum(["cash", "transfer"]),
});

type FormValues = z.infer<typeof schema>;
type PaymentFormValues = z.infer<typeof paymentSchema>;

const defaults: FormValues = {
  nombre: "",
  telefono: "",
  email: "",
  direccion: "",
  observaciones: "",
};

type MutInput = { values: FormValues; knownUpdatedAt: string | null };

// ── RegisterPaymentDialog ─────────────────────────────────────────────────────
function RegisterPaymentDialog({
  open,
  onOpenChange,
  customer,
  balance,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer | null;
  balance: number;
  onSuccess: () => void;
}) {
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: "", observacion: "", payment_method: "cash" },
  });

  const mut = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!customer) throw new Error("Sin cliente");
      const amount = Number(values.amount);
      if (amount > balance + 0.001) {
        throw new Error(
          `El pago (${fmtMoney(amount)}) supera el saldo pendiente (${fmtMoney(balance)})`,
        );
      }
      return registerCustomerPayment(customer.id, {
        amount,
        observacion: values.observacion?.trim() || null,
        payment_method: values.payment_method,
      });
    },
    onSuccess: () => {
      toast.success("Pago registrado");
      form.reset({ amount: "", observacion: "", payment_method: "cash" });
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleClose() {
    if (mut.isPending) return;
    form.reset({ amount: "", observacion: "", payment_method: "cash" });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        {customer && (
          <p className="text-sm text-muted-foreground -mt-2">
            Cliente: <span className="font-medium text-foreground">{customer.nombre}</span>
            {" · "}Saldo actual:{" "}
            <span className="font-medium text-destructive">{fmtMoney(balance)}</span>
          </p>
        )}
        <form onSubmit={form.handleSubmit((v) => mut.mutate(v))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-amount">
              Importe <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={balance}
              placeholder="0.00"
              autoFocus
              {...form.register("amount")}
              onFocus={(e) => e.target.select()}
            />
            {form.formState.errors.amount && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {form.formState.errors.amount.message}
              </p>
            )}
          </div>
          {/* Forma de pago */}
          <div className="space-y-2">
            <Label>Forma de pago <span className="text-destructive">*</span></Label>
            <RadioGroup
              value={form.watch("payment_method")}
              onValueChange={(v) => form.setValue("payment_method", v as "cash" | "transfer")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex-1">
                <RadioGroupItem value="cash" id="pm-cash" />
                <Label htmlFor="pm-cash" className="flex items-center gap-1.5 cursor-pointer font-normal">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                  Efectivo
                </Label>
              </div>
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex-1">
                <RadioGroupItem value="transfer" id="pm-transfer" />
                <Label htmlFor="pm-transfer" className="flex items-center gap-1.5 cursor-pointer font-normal">
                  <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                  Transferencia
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-observacion">Observación (opcional)</Label>
            <Textarea
              id="pay-observacion"
              rows={2}
              placeholder="Ej: pago parcial"
              {...form.register("observacion")}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={mut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending || balance <= 0}>
              {mut.isPending ? "Guardando..." : "Confirmar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── CustomerAccountSheet ──────────────────────────────────────────────────────
function CustomerAccountSheet({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: accountData, isLoading } = useQuery({
    queryKey: ["customer_account", customer?.id],
    queryFn: () => getCustomerAccount(customer!.id),
    enabled: !!customer,
    staleTime: 0,
  });

  const balance = Number(accountData?.balance ?? 0);
  const movements = accountData?.movements ?? [];

  function handlePaymentSuccess() {
    qc.invalidateQueries({ queryKey: ["customer_account", customer?.id] });
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <>
      <Sheet open={!!customer} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Cuenta corriente
            </SheetTitle>
            {customer && (
              <p className="text-sm text-muted-foreground mt-0.5">{customer.nombre}</p>
            )}
          </SheetHeader>

          <div className="flex flex-col gap-0 overflow-hidden flex-1">
            {/* ── Info del cliente ─────────────────────────────────────── */}
            {customer && (
              <div className="px-6 py-3 bg-muted/30 border-b shrink-0">
                <div className="flex flex-wrap gap-x-6 gap-y-0.5 text-sm text-muted-foreground">
                  {customer.telefono && <span>📞 {customer.telefono}</span>}
                  {customer.email && <span>✉️ {customer.email}</span>}
                  {customer.direccion && <span>📍 {customer.direccion}</span>}
                </div>
              </div>
            )}

            {/* ── Saldo ────────────────────────────────────────────────── */}
            <div className="px-6 py-5 border-b shrink-0">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Saldo pendiente
                  </p>
                  {isLoading ? (
                    <div className="h-9 w-32 rounded bg-muted animate-pulse" />
                  ) : (
                    <p
                      className={[
                        "text-3xl font-bold tabular-nums",
                        balance > 0 ? "text-destructive" : "text-green-600",
                      ].join(" ")}
                    >
                      {fmtMoney(balance)}
                    </p>
                  )}
                  {!isLoading && balance === 0 && (
                    <p className="text-xs text-green-600 mt-0.5">Sin deuda pendiente ✓</p>
                  )}
                </div>
                <Button
                  onClick={() => setPaymentOpen(true)}
                  disabled={balance <= 0 || isLoading}
                  className="shrink-0"
                >
                  Registrar pago
                </Button>
              </div>
            </div>

            {/* ── Historial ────────────────────────────────────────────── */}
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="px-6 py-3 border-b shrink-0">
                <h3 className="text-sm font-semibold">Historial de movimientos</h3>
              </div>

              <ScrollArea className="flex-1">
                {isLoading ? (
                  <div className="p-6 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : movements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                    <Wallet className="h-8 w-8" />
                    <p className="text-sm">Sin movimientos registrados</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {movements.map((mv) => {
                      const amount = Number(mv.amount);
                      const balAfter = Number(mv.balanceAfter);
                      const isDebit = amount > 0;
                      return (
                        <div key={mv.id} className="px-6 py-3.5 hover:bg-muted/30 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className="mt-0.5 shrink-0">
                                <MovementIcon type={mv.type} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium leading-tight">{movementLabel(mv.type)}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{fmtDateTime(mv.createdAt)}</p>
                                {mv.type === "payment" && mv.paymentMethod && (
                                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                    {mv.paymentMethod === "cash"
                                      ? <><Banknote className="h-3 w-3" /> Efectivo</>
                                      : <><ArrowLeftRight className="h-3 w-3" /> Transferencia</>}
                                  </p>
                                )}
                                {mv.observacion && (
                                  <p className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-[200px]">
                                    {mv.observacion}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p
                                className={[
                                  "text-sm font-semibold tabular-nums",
                                  isDebit ? "text-destructive" : "text-green-600",
                                ].join(" ")}
                              >
                                {isDebit ? "+" : "−"} {fmtMoney(Math.abs(amount))}
                              </p>
                              <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                                Saldo: {fmtMoney(balAfter)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <RegisterPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        customer={customer}
        balance={balance}
        onSuccess={handlePaymentSuccess}
      />
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function CustomersPage() {
  const qc = useQueryClient();
  const isOnline = useOnlineStatus();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: listCustomers,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [knownUpdatedAt, setKnownUpdatedAt] = useState<string | null>(null);
  const [conflictPending, setConflictPending] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);
  const [accountCustomer, setAccountCustomer] = useState<Customer | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.telefono ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [customers, search]);

  function openNew() {
    setEditing(null);
    setKnownUpdatedAt(null);
    setConflictPending(false);
    setPendingValues(null);
    form.reset(defaults);
    setOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setKnownUpdatedAt(c.updatedAt ?? null);
    setConflictPending(false);
    setPendingValues(null);
    form.reset({
      nombre: c.nombre,
      telefono: c.telefono ?? "",
      email: c.email ?? "",
      direccion: c.direccion ?? "",
      observaciones: c.observaciones ?? "",
    });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async ({ values, knownUpdatedAt }: MutInput) => {
      const payload: CustomerInput = {
        nombre: values.nombre,
        telefono: values.telefono?.trim() ? values.telefono : null,
        email: values.email?.trim() ? values.email : null,
        direccion: values.direccion?.trim() ? values.direccion : null,
        observaciones: values.observaciones?.trim() ? values.observaciones : null,
      };
      if (editing) {
        return updateCustomer(editing.id, payload, knownUpdatedAt);
      }
      log("CUSTOMER_CREATE_START", { nombre: payload.nombre });
      if (!isOnline || !navigator.onLine) {
        await enqueue("customer_create", payload);
        log("CUSTOMER_CREATE_ENQUEUED", { nombre: payload.nombre, trigger: "offline" });
        return null;
      }
      try {
        return await createCustomer(payload);
      } catch (e) {
        if (isNetworkError(e)) {
          await enqueue("customer_create", payload);
          log("CUSTOMER_CREATE_ENQUEUED", { nombre: payload.nombre, trigger: "network_error" });
          return null;
        }
        throw e;
      }
    },
  });

  useEffect(() => {
    log("MUTATION_STATE_CHANGE", { entity: "customer", isPending: saveMut.isPending, status: saveMut.status, isSuccess: saveMut.isSuccess, isError: saveMut.isError });
  }, [saveMut.isPending, saveMut.status, saveMut.isSuccess, saveMut.isError]);

  const delMut = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Cliente eliminado");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleSave(values: FormValues, forcedUpdatedAt: string | null) {
    try {
      const result = await saveMut.mutateAsync({ values, knownUpdatedAt: forcedUpdatedAt });
      if (result === null) {
        toast.success("Cliente guardado localmente. Se sincronizará al reconectar.");
      } else {
        qc.invalidateQueries({ queryKey: ["customers"] });
        toast.success(editing ? "Cliente actualizado" : "Cliente creado");
      }
      setOpen(false);
      setConflictPending(false);
      setPendingValues(null);
    } catch (e) {
      if (e instanceof ConflictError) {
        setPendingValues(values);
        setConflictPending(true);
        return;
      }
      log("MUTATION_ERROR", { entity: "customer", error: String(e) }, "error");
      if (e instanceof Error && e.message.includes("customers_nombre_telefono_owner_unique")) {
        toast.error("Ya existe un cliente con el mismo nombre y teléfono");
      } else if (e instanceof Error && e.message.includes("customers_email_check")) {
        toast.error("El email no es válido");
      } else {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Clientes</h1>
          {!isOnline && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <WifiOff className="h-4 w-4" /> Offline
            </span>
          )}
        </div>
        <Button onClick={openNew} className="gap-2" disabled={saveMut.isPending}>
          <Plus className="h-4 w-4" /> Nuevo cliente
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nombre, teléfono o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="hidden md:table-cell">Dirección</TableHead>
              <TableHead className="hidden lg:table-cell">Observaciones</TableHead>
              <TableHead className="text-right">Deuda</TableHead>
              <TableHead className="w-28 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8" />
                    <span className="text-sm">
                      {search ? "Sin resultados para la búsqueda" : "Sin clientes registrados"}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => {
                const bal = Number(c.balance ?? 0);
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => setAccountCustomer(c)}
                  >
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell className="text-muted-foreground">{c.telefono ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground max-w-[200px] truncate">
                      {c.direccion ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[200px] truncate">
                      {c.observaciones ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {bal > 0 ? (
                        <Badge variant="destructive" className="tabular-nums font-mono text-xs">
                          {fmtMoney(bal)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Ver cuenta corriente"
                          onClick={(e) => { e.stopPropagation(); setAccountCustomer(c); }}
                        >
                          <Wallet className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar cliente"
                          onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                          disabled={saveMut.isPending}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Eliminar cliente"
                          onClick={(e) => { e.stopPropagation(); setDeleting(c); }}
                        >
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

      {/* ── Cuenta Corriente Sheet ──────────────────────────────────────────── */}
      <CustomerAccountSheet
        customer={accountCustomer}
        onClose={() => setAccountCustomer(null)}
      />

      {/* ── Crear / Editar cliente ──────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => handleSave(v, knownUpdatedAt))} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nombre">
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input id="nombre" {...form.register("nombre")} autoFocus />
                {form.formState.errors.nombre && (
                  <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input id="telefono" type="tel" {...form.register("telefono")} />
                {form.formState.errors.telefono && (
                  <p className="text-sm text-destructive">{form.formState.errors.telefono.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")} />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input id="direccion" {...form.register("direccion")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea id="observaciones" rows={3} {...form.register("observaciones")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Confirmar eliminación ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Las ventas asociadas a este cliente quedarán sin
              cliente asignado.
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

      <ConflictDialog
        open={conflictPending && !!editing}
        onContinue={() => {
          if (pendingValues) handleSave(pendingValues, null);
        }}
        onCancel={() => {
          setConflictPending(false);
          setPendingValues(null);
          setOpen(false);
        }}
      />
    </div>
  );
}
