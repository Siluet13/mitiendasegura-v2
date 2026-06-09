import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, DollarSign, ImageIcon, Info, Save } from "lucide-react";
import { getBusinessSettings, upsertBusinessSettings } from "@/lib/api/settings";
import type { BusinessSettingsInput } from "@/lib/api/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configuración del Negocio" }] }),
  component: SettingsPage,
});

// ─── Zod schema ──────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

function SettingsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["business_settings"],
    queryFn: getBusinessSettings,
    staleTime: 300_000,
  });

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

  // Populate form when data loads
  useEffect(() => {
    if (!data) return;
    reset({
      nombre_negocio:  data.nombre_negocio ?? "",
      razon_social:    data.razon_social ?? "",
      telefono:        data.telefono ?? "",
      email:           data.email ?? "",
      direccion:       data.direccion ?? "",
      ciudad:          data.ciudad ?? "",
      provincia:       data.provincia ?? "",
      pais:            data.pais ?? "",
      moneda:          data.moneda ?? "ARS",
      simbolo_moneda:  data.simbolo_moneda ?? "$",
      decimales:       data.decimales ?? 2,
      logo_url:        data.logo_url ?? "",
      mensaje_tickets: data.mensaje_tickets ?? "",
      observaciones:   data.observaciones ?? "",
    });
  }, [data, reset]);

  const mut = useMutation({
    mutationFn: (values: SettingsFormValues) => {
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
      return upsertBusinessSettings(input);
    },
    onSuccess: () => {
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["business_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logoUrl = watch("logo_url");

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

      <form onSubmit={handleSubmit((v) => mut.mutate(v))} className="space-y-6">

        {/* ── Datos del negocio ─────────────────────────────────────────── */}
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

        {/* ── Configuración monetaria ───────────────────────────────────── */}
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

        {/* ── Identidad visual ─────────────────────────────────────────── */}
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

        {/* ── Información adicional ─────────────────────────────────────── */}
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

        {/* ── Guardar ───────────────────────────────────────────────────── */}
        <div className="flex justify-end pb-6">
          <Button type="submit" disabled={mut.isPending} className="gap-2 min-w-36">
            <Save className="h-4 w-4" />
            {mut.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>

      </form>
    </div>
  );
}
