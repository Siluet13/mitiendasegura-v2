import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getBusinessDetail,
  updateLicense,
  updateBusinessSettings,
  registerPayment,
} from "@/lib/api/admin";
import type { BusinessDetail } from "@/lib/api/admin";
import type { LicenseStatus } from "@/hooks/useLicense";
import { getBillingStatus } from "@shared/billing";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Pencil, X, Check } from "lucide-react";

interface Props {
  ownerId: string | null;
  onClose: () => void;
}

const STATUS_LABELS: Record<LicenseStatus, string> = {
  activa: "Activa",
  pendiente: "Pendiente",
  suspendida: "Suspendida",
  vencida: "Vencida",
};

const STATUS_VARIANTS: Record<LicenseStatus, "default" | "secondary" | "destructive" | "outline"> = {
  activa: "default",
  pendiente: "outline",
  suspendida: "destructive",
  vencida: "secondary",
};

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("es-AR");
}

function fmtFull(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("es-AR");
}

function toDateInputValue(date: string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 items-start py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm break-all">{value ?? "—"}</span>
    </div>
  );
}

function DaysLeftBadge({ billingCycleEnd }: { billingCycleEnd: string | null }) {
  if (!billingCycleEnd) return <span className="text-muted-foreground text-sm">—</span>;
  const billing = getBillingStatus({
    billing_cycle_end: billingCycleEnd,
    billing_cycle_start: null,
    last_payment_date: null,
  });
  const { daysLeft } = billing;
  if (daysLeft <= 0)
    return <span className="text-sm font-medium text-destructive">Vencido</span>;
  if (daysLeft <= 5)
    return <span className="text-sm font-medium text-yellow-600">{daysLeft} días</span>;
  return <span className="text-sm text-green-600">{daysLeft} días</span>;
}

function BillingStatusBadge({ billingCycleEnd }: { billingCycleEnd: string | null }) {
  if (!billingCycleEnd) return <Badge variant="outline">Sin datos</Badge>;
  const { status } = getBillingStatus({
    billing_cycle_end: billingCycleEnd,
    billing_cycle_start: null,
    last_payment_date: null,
  });
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    active: { label: "Activo", variant: "default" },
    warning: { label: "Por vencer", variant: "outline" },
    expired: { label: "Vencido", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

interface EditState {
  nombreNegocio: string;
  billingCycleEnd: string;
}

export function BusinessDetailSheet({ ownerId, onClose }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<EditState>({ nombreNegocio: "", billingCycleEnd: "" });

  const { data: detail, isLoading, error } = useQuery<BusinessDetail>({
    queryKey: ["/api/admin/businesses", ownerId],
    queryFn: () => getBusinessDetail(ownerId!),
    enabled: !!ownerId,
    staleTime: 30_000,
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
    if (ownerId) {
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses", ownerId] });
    }
  }

  const editMut = useMutation({
    mutationFn: (input: EditState) =>
      updateBusinessSettings(ownerId!, {
        nombreNegocio: input.nombreNegocio,
        billingCycleEnd: input.billingCycleEnd
          ? new Date(input.billingCycleEnd).toISOString()
          : undefined,
      }),
    onSuccess: () => {
      invalidateAll();
      setEditing(false);
      toast.success("Datos actualizados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paymentMut = useMutation({
    mutationFn: () => registerPayment(ownerId!),
    onSuccess: () => {
      invalidateAll();
      toast.success("Pago registrado — ciclo renovado 30 días");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const licenseMut = useMutation({
    mutationFn: (status: LicenseStatus) => updateLicense(ownerId!, { status }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Licencia actualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isPending = editMut.isPending || paymentMut.isPending || licenseMut.isPending;

  function startEdit() {
    if (!detail) return;
    setEditState({
      nombreNegocio: detail.nombreNegocio ?? "",
      billingCycleEnd: toDateInputValue(detail.billingCycleEnd),
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function saveEdit() {
    editMut.mutate(editState);
  }

  const displayName = detail?.nombreNegocio ?? detail?.email ?? ownerId ?? "Comercio";

  return (
    <Sheet open={!!ownerId} onOpenChange={(open) => { if (!open) { setEditing(false); onClose(); } }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-lg truncate">{displayName}</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="py-12 text-center text-sm text-muted-foreground">Cargando...</div>
        )}

        {error && (
          <div className="py-12 text-center text-sm text-destructive">
            Error al cargar los datos
          </div>
        )}

        {detail && (
          <div className="space-y-5">
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Información del negocio
                </h3>
                {!editing ? (
                  <Button variant="ghost" size="sm" onClick={startEdit} className="h-7 px-2">
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-7 px-2"
                      onClick={saveEdit}
                      disabled={isPending}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Guardar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={cancelEdit}
                      disabled={isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-nombre" className="text-xs">Nombre del negocio</Label>
                    <Input
                      id="edit-nombre"
                      value={editState.nombreNegocio}
                      onChange={(e) =>
                        setEditState((s) => ({ ...s, nombreNegocio: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-expiry" className="text-xs">
                      Fecha de vencimiento (ciclo de billing)
                    </Label>
                    <Input
                      id="edit-expiry"
                      type="date"
                      value={editState.billingCycleEnd}
                      onChange={(e) =>
                        setEditState((s) => ({ ...s, billingCycleEnd: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <DetailRow label="Nombre del negocio" value={detail.nombreNegocio} />
                  <DetailRow
                    label="Propietario"
                    value={
                      [detail.firstName, detail.lastName].filter(Boolean).join(" ") || "—"
                    }
                  />
                  <DetailRow label="Email" value={detail.email} />
                  <DetailRow
                    label="Owner ID"
                    value={
                      <span className="font-mono text-xs text-muted-foreground break-all">
                        {detail.ownerId}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Tenant ID"
                    value={
                      detail.tenantId ? (
                        <span className="font-mono text-xs text-muted-foreground break-all">
                          {detail.tenantId}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )
                    }
                  />
                  <DetailRow label="Fecha de alta" value={fmtFull(detail.registeredAt)} />
                </div>
              )}
            </section>

            <Separator />

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Licencia y billing
              </h3>
              <DetailRow
                label="Estado licencia"
                value={
                  <Badge variant={STATUS_VARIANTS[detail.licenseStatus]}>
                    {STATUS_LABELS[detail.licenseStatus]}
                  </Badge>
                }
              />
              <DetailRow
                label="Estado billing"
                value={<BillingStatusBadge billingCycleEnd={detail.billingCycleEnd} />}
              />
              <DetailRow label="Activada el" value={fmt(detail.licenseActivatedAt)} />
              <DetailRow label="Último pago" value={fmt(detail.lastPaymentDate)} />
              <DetailRow
                label="Vencimiento"
                value={fmt(detail.billingCycleEnd)}
              />
              <DetailRow
                label="Días restantes"
                value={<DaysLeftBadge billingCycleEnd={detail.billingCycleEnd} />}
              />
              {detail.licenseSuspendedAt && (
                <DetailRow label="Suspendida el" value={fmt(detail.licenseSuspendedAt)} />
              )}
              {detail.licenseNotes && (
                <DetailRow label="Notas" value={detail.licenseNotes} />
              )}
            </section>

            <Separator />

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Acciones
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => paymentMut.mutate()}
                  disabled={isPending}
                  className="gap-1.5"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Registrar pago
                </Button>

                {detail.licenseStatus !== "activa" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => licenseMut.mutate("activa")}
                    disabled={isPending}
                  >
                    Activar
                  </Button>
                )}

                {(detail.licenseStatus === "suspendida" || detail.licenseStatus === "vencida") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => licenseMut.mutate("activa")}
                    disabled={isPending}
                  >
                    Reactivar
                  </Button>
                )}

                {detail.licenseStatus === "activa" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => licenseMut.mutate("suspendida")}
                      disabled={isPending}
                    >
                      Suspender
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => licenseMut.mutate("vencida")}
                      disabled={isPending}
                    >
                      Marcar vencida
                    </Button>
                  </>
                )}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
