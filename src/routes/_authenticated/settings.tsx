import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, DollarSign, FileText, Hash, ImageIcon, Info, Save } from "lucide-react";
import { getBusinessSettings, upsertBusinessSettings, ConflictError } from "@/lib/api/settings";
import { getReceiptSettings, upsertReceiptSettings } from "@/lib/api/receipts";
import { log } from "@/lib/offline/logger";
import type { BusinessSettingsInput } from "@/lib/api/settings";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configuración del Negocio" }] }),
  component: SettingsPage,
});

const settingsSchema = z.object({
  nombre_negocio: z.string().trim().min(1, "El nombre del negocio es obligatorio").max(200),
  razon_social:    z.string().trim().max(200).optional(),
  telefono:        z.string().trim().max(50).optional(),
  email:           z.union([z.string().email("Email inválido"), z.literal("")]).optional(),
  direccion:       z.string().trim().max(300).optional(),
  ciudad:          z.string().trim().max(100).optional(),
  provincia:       z.string().trim().max(100).optional(),
  pais:            z.string().trim().max(100).optional(),
  moneda:          z.string().trim().min(1).max(10),
  simbolo_moneda:  z.string().trim().min(1).max(5),
  decimales:       z.coerce.number().int().min(0, "Mínimo 0 decimales").max(4, "Máximo 4 decimales"),
  logo_url:        z.union([z.string().url("URL de logo inválida"), z.literal("")]).optional(),
  mensaje_tickets: z.string().trim().max(500).optional(),
  observaciones:   z.string().trim().max(1000).optional(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const DEFAULT_VALUES: SettingsFormValues = {
  nombre_negocio:  "",
  razon_social:    "",
  telefono:        "",
  email:           "",
  direccion:       "",
  ciudad:          "",
  provincia:       "",
  pais:            "",
  moneda:          "ARS",
  simbolo_moneda:  "$",
  decimales:       2,
  logo_url:        "",
  mensaje_tickets: "",
  observaciones:   "",
};

function SettingsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["business_settings"],
    queryFn: getBusinessSettings,
    staleTime: 300_000,
  });

  const knownUpdatedAtRef = useRef<string | null>(null);
  const [conflictPending, setConflictPending] = useState(false);
  const [pendingInput, setPendingInput] = useState<BusinessSettingsInput | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!data) return;
    knownUpdatedAtRef.current = data.updatedAt ?? null;
    reset({
      nombre_negocio:  data.nombreNegocio ?? "",
      razon_social:    data.razonSocial ?? "",
      telefono:        data.telefono ?? "",
      email:           data.email ?? "",
      direccion:       data.direccion ?? "",
      ciudad:          data.ciudad ?? "",
      provincia:       data.provincia ?? "",
      pais:            data.pais ?? "",
      moneda:          data.moneda ?? "ARS",
      simbolo_moneda:  data.simboloMoneda ?? "$",
      decimales:       data.decimales ?? 2,
      logo_url:        data.logoUrl ?? "",
      mensaje_tickets: data.mensajeTickets ?? "",
      observaciones:   data.observaciones ?? "",
    });
  }, [data, reset]);

  const mut = useMutation({
    mutationFn: ({ input, knownUpdatedAt }: { input: BusinessSettingsInput; knownUpdatedAt: string | null }) =>
      upsertBusinessSettings(input, knownUpdatedAt),
    onSuccess: () => {
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["business_settings"] });
      setConflictPending(false);
      setPendingInput(null);
    },
    onError: (e: Error) => {
      if (e instanceof ConflictError) {
        return;
      }
      toast.error(e.message);
    },
  });

  useEffect(() => {
    log("MUTATION_STATE_CHANGE", { entity: "settings", isPending: mut.isPending, status: mut.status, isSuccess: mut.isSuccess, isError: mut.isError });
  }, [mut.isPending, mut.status, mut.isSuccess, mut.isError]);

  const logoUrl = watch("logo_url");

  async function handleSave(values: SettingsFormValues, forcedUpdatedAt: string | null) {
    const input: BusinessSettingsInput = {
      nombre_negocio:  values.nombre_negocio,
      razon_social:    values.razon_social?.trim() || null,
      telefono:        values.telefono?.trim() || null,
      email:           values.email?.trim() || null,
      direccion:       values.direccion?.trim() || null,
      ciudad:          values.ciudad?.trim() || null,
      provincia:       values.provincia?.trim() || null,
      pais:            values.pais?.trim() || null,
      moneda:          values.moneda,
      simbolo_moneda:  values.simbolo_moneda,
      decimales:       values.decimales,
      logo_url:        values.logo_url?.trim() || null,
      mensaje_tickets: values.mensaje_tickets?.trim() || null,
      observaciones:   values.observaciones?.trim() || null,
    };
    try {
      await mut.mutateAsync({ input, knownUpdatedAt: forcedUpdatedAt });
    } catch (e) {
      if (e instanceof ConflictError) {
        setPendingInput(input);
        setConflictPending(true);
      } else {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Configuración del Negocio</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Datos generales de tu comercio o empresa
        </p>
      </div>

      <form onSubmit={handleSubmit((v) => handleSave(v, knownUpdatedAtRef.current))} className="space-y-6">

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Datos del negocio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="nombre_negocio">
                  Nombre del negocio <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="nombre_negocio"
                  placeholder="Ej: Mi Comercio"
                  {...register("nombre_negocio")}
                />
                {errors.nombre_negocio && (
                  <p className="text-xs text-destructive">{errors.nombre_negocio.message}</p>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="razon_social">Razón social</Label>
                <Input
                  id="razon_social"
                  placeholder="Denominación legal"
                  {...register("razon_social")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  type="tel"
                  placeholder="+54 9 11 0000-0000"
                  {...register("telefono")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="contacto@negocio.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input
                  id="direccion"
                  placeholder="Calle y número"
                  {...register("direccion")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ciudad">Ciudad</Label>
                <Input id="ciudad" placeholder="Ciudad" {...register("ciudad")} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="provincia">Provincia / Estado</Label>
                <Input id="provincia" placeholder="Provincia" {...register("provincia")} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pais">País</Label>
                <Input id="pais" placeholder="Argentina" {...register("pais")} />
              </div>

            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Configuración monetaria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">

              <div className="space-y-1.5">
                <Label htmlFor="moneda">Moneda</Label>
                <Input
                  id="moneda"
                  placeholder="ARS"
                  maxLength={10}
                  {...register("moneda")}
                />
                <p className="text-xs text-muted-foreground">Código ISO (ARS, USD, EUR…)</p>
                {errors.moneda && (
                  <p className="text-xs text-destructive">{errors.moneda.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="simbolo_moneda">Símbolo</Label>
                <Input
                  id="simbolo_moneda"
                  placeholder="$"
                  maxLength={5}
                  {...register("simbolo_moneda")}
                />
                {errors.simbolo_moneda && (
                  <p className="text-xs text-destructive">{errors.simbolo_moneda.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="decimales">Decimales</Label>
                <Input
                  id="decimales"
                  type="number"
                  min={0}
                  max={4}
                  step={1}
                  {...register("decimales")}
                />
                {errors.decimales && (
                  <p className="text-xs text-destructive">{errors.decimales.message}</p>
                )}
              </div>

            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              Identidad visual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="logo_url">URL del logo</Label>
              <Input
                id="logo_url"
                type="url"
                placeholder="https://ejemplo.com/logo.png"
                {...register("logo_url")}
              />
              {errors.logo_url && (
                <p className="text-xs text-destructive">{errors.logo_url.message}</p>
              )}
            </div>

            {logoUrl && logoUrl.startsWith("http") && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Vista previa</Label>
                <div className="flex items-center justify-center rounded-md border bg-muted/30 p-4 h-28">
                  <img
                    src={logoUrl}
                    alt="Logo del negocio"
                    className="max-h-20 max-w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Información adicional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mensaje_tickets">Mensaje para tickets</Label>
              <Textarea
                id="mensaje_tickets"
                rows={3}
                placeholder="Ej: ¡Gracias por su compra! Conserve su ticket."
                {...register("mensaje_tickets")}
              />
              <p className="text-xs text-muted-foreground">
                Se mostrará en los tickets cuando se implementen las impresiones.
              </p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="observaciones">Observaciones internas</Label>
              <Textarea
                id="observaciones"
                rows={3}
                placeholder="Notas internas del negocio…"
                {...register("observaciones")}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pb-6">
          <Button type="submit" disabled={mut.isPending} className="gap-2 min-w-36">
            <Save className="h-4 w-4" />
            {mut.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>

      </form>

      <ConflictDialog
        open={conflictPending}
        onContinue={() => {
          if (pendingInput) {
            mut.mutate({ input: pendingInput, knownUpdatedAt: null });
          }
        }}
        onCancel={() => {
          setConflictPending(false);
          setPendingInput(null);
        }}
      />

      <ReceiptSettingsSection />
    </div>
  );
}

const receiptSchema = z.object({
  habilitado:           z.boolean(),
  mostrar_dialogo:      z.boolean(),
  impresion_automatica: z.boolean(),
  descarga_automatica:  z.boolean(),
  tipo_comprobante:     z.enum(["ticket_58mm", "ticket_80mm", "a4"]),
  prefijo_numeracion:   z.string().trim().min(1).max(10),
  proximo_numero:       z.coerce.number().int().min(1),
  nombre_comercial:     z.string().trim().max(200).optional(),
  razon_social:         z.string().trim().max(200).optional(),
  cuit:                 z.string().trim().max(30).optional(),
  domicilio:            z.string().trim().max(300).optional(),
  telefono:             z.string().trim().max(50).optional(),
  email:                z.union([z.string().email("Email inválido"), z.literal("")]).optional(),
  sitio_web:            z.string().trim().max(200).optional(),
  logo_url:             z.union([z.string().url("URL inválida"), z.literal("")]).optional(),
  mensaje_pie:          z.string().trim().max(500).optional(),
});

type ReceiptFormValues = z.infer<typeof receiptSchema>;

const RECEIPT_DEFAULTS: ReceiptFormValues = {
  habilitado:           false,
  mostrar_dialogo:      true,
  impresion_automatica: false,
  descarga_automatica:  false,
  tipo_comprobante:     "ticket_80mm",
  prefijo_numeracion:   "V",
  proximo_numero:       1,
  nombre_comercial:     "",
  razon_social:         "",
  cuit:                 "",
  domicilio:            "",
  telefono:             "",
  email:                "",
  sitio_web:            "",
  logo_url:             "",
  mensaje_pie:          "",
};

function SwitchRow({
  control,
  name,
  label,
  description,
}: {
  control: any;
  name: keyof ReceiptFormValues;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch checked={field.value as boolean} onCheckedChange={field.onChange} />
        )}
      />
    </div>
  );
}

function ReceiptSettingsSection() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["receipt_settings"],
    queryFn: getReceiptSettings,
    staleTime: 300_000,
  });

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptSchema),
    defaultValues: RECEIPT_DEFAULTS,
  });

  useEffect(() => {
    if (!data) return;
    reset({
      habilitado:           data.habilitado ?? false,
      mostrar_dialogo:      data.mostrar_dialogo ?? true,
      impresion_automatica: data.impresion_automatica ?? false,
      descarga_automatica:  data.descarga_automatica ?? false,
      tipo_comprobante:     (data.tipo_comprobante as ReceiptFormValues["tipo_comprobante"]) ?? "ticket_80mm",
      prefijo_numeracion:   data.prefijo_numeracion ?? "V",
      proximo_numero:       data.proximo_numero ?? 1,
      nombre_comercial:     data.nombre_comercial ?? "",
      razon_social:         data.razon_social ?? "",
      cuit:                 data.cuit ?? "",
      domicilio:            data.domicilio ?? "",
      telefono:             data.telefono ?? "",
      email:                data.email ?? "",
      sitio_web:            data.sitio_web ?? "",
      logo_url:             data.logo_url ?? "",
      mensaje_pie:          data.mensaje_pie ?? "",
    });
  }, [data, reset]);

  const mut = useMutation({
    mutationFn: (values: ReceiptFormValues) => {
      return upsertReceiptSettings({
        habilitado:           values.habilitado,
        mostrar_dialogo:      values.mostrar_dialogo,
        impresion_automatica: values.impresion_automatica,
        descarga_automatica:  values.descarga_automatica,
        tipo_comprobante:     values.tipo_comprobante,
        prefijo_numeracion:   values.prefijo_numeracion,
        proximo_numero:       values.proximo_numero,
        nombre_comercial:     values.nombre_comercial?.trim() || null,
        razon_social:         values.razon_social?.trim() || null,
        cuit:                 values.cuit?.trim() || null,
        domicilio:            values.domicilio?.trim() || null,
        telefono:             values.telefono?.trim() || null,
        email:                values.email?.trim() || null,
        sitio_web:            values.sitio_web?.trim() || null,
        logo_url:             values.logo_url?.trim() || null,
        mensaje_pie:          values.mensaje_pie?.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Configuración de comprobantes guardada");
      qc.invalidateQueries({ queryKey: ["receipt_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const habilitado = watch("habilitado");

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <form
      onSubmit={handleSubmit((v) => mut.mutate(v))}
      className="space-y-6 pb-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Comprobantes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Activar comprobantes</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Al registrar una venta se asignará un número y se podrá imprimir o descargar.
              </p>
            </div>
            <Controller
              control={control}
              name="habilitado"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          {habilitado && (
            <>
              <Separator />

              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-xs">
                  Comportamiento post-venta
                </p>
                <SwitchRow
                  control={control}
                  name="mostrar_dialogo"
                  label="Mostrar diálogo de comprobante"
                  description="Abre automáticamente el comprobante luego de cada venta."
                />
                <SwitchRow
                  control={control}
                  name="impresion_automatica"
                  label="Imprimir automáticamente"
                  description="Lanza la impresión sin que el usuario tenga que hacer clic."
                />
                <SwitchRow
                  control={control}
                  name="descarga_automatica"
                  label="Descargar PDF automáticamente"
                  description="Genera y descarga el PDF luego de cada venta."
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-xs">
                  Formato y numeración
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="tipo_comprobante">Formato</Label>
                    <Controller
                      control={control}
                      name="tipo_comprobante"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="tipo_comprobante">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ticket_58mm">Ticket 58mm</SelectItem>
                            <SelectItem value="ticket_80mm">Ticket 80mm</SelectItem>
                            <SelectItem value="a4">A4</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="prefijo_numeracion">
                      <Hash className="inline h-3 w-3 mr-1" />
                      Prefijo
                    </Label>
                    <Input
                      id="prefijo_numeracion"
                      maxLength={10}
                      placeholder="V"
                      {...register("prefijo_numeracion")}
                    />
                    {errors.prefijo_numeracion && (
                      <p className="text-xs text-destructive">{errors.prefijo_numeracion.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="proximo_numero">Próximo número</Label>
                    <Input
                      id="proximo_numero"
                      type="number"
                      min={1}
                      step={1}
                      {...register("proximo_numero")}
                    />
                    {errors.proximo_numero && (
                      <p className="text-xs text-destructive">{errors.proximo_numero.message}</p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-xs">
                  Datos del emisor
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="nombre_comercial">Nombre comercial</Label>
                    <Input id="nombre_comercial" {...register("nombre_comercial")} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="razon_social_receipt">Razón social</Label>
                    <Input id="razon_social_receipt" {...register("razon_social")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cuit">CUIT / RUT / NIT</Label>
                    <Input id="cuit" {...register("cuit")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telefono_receipt">Teléfono</Label>
                    <Input id="telefono_receipt" type="tel" {...register("telefono")} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="domicilio">Domicilio fiscal</Label>
                    <Input id="domicilio" {...register("domicilio")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email_receipt">Email</Label>
                    <Input id="email_receipt" type="email" {...register("email")} />
                    {errors.email && (
                      <p className="text-xs text-destructive">{errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sitio_web">Sitio web</Label>
                    <Input id="sitio_web" {...register("sitio_web")} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="logo_url_receipt">URL del logo</Label>
                    <Input id="logo_url_receipt" type="url" {...register("logo_url")} />
                    {errors.logo_url && (
                      <p className="text-xs text-destructive">{errors.logo_url.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="mensaje_pie">Mensaje de pie</Label>
                    <Textarea id="mensaje_pie" rows={2} {...register("mensaje_pie")} />
                  </div>
                </div>
              </div>
            </>
          )}

        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={mut.isPending} className="gap-2 min-w-36">
          <Save className="h-4 w-4" />
          {mut.isPending ? "Guardando…" : "Guardar comprobantes"}
        </Button>
      </div>
    </form>
  );
}
