import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { receiptSettings } from "@shared/schema";

export function registerReceiptsRoutes(app: Express): void {
  app.get("/api/receipts/settings", isAuthenticated, async (req, res) => {
    const { tenantId } = requireTenant(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant no configurado" });

    const [row] = await db
      .select()
      .from(receiptSettings)
      .where(eq(receiptSettings.tenantId, tenantId));

    res.json(row ?? null);
  });

  app.put("/api/receipts/settings", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    if (!tenantId) return res.status(500).json({ message: "Tenant no configurado" });

    const body = req.body;

    const values = {
      tenantId,
      ownerId: userId,
      habilitado: body.habilitado ?? false,
      mostrarDialogo: body.mostrar_dialogo ?? true,
      impresionAutomatica: body.impresion_automatica ?? false,
      descargaAutomatica: body.descarga_automatica ?? false,
      tipoComprobante: body.tipo_comprobante ?? "ticket_80mm",
      prefijoNumeracion: body.prefijo_numeracion ?? "V",
      proximoNumero: typeof body.proximo_numero === "number" ? body.proximo_numero : 1,
      logoUrl: body.logo_url ?? null,
      nombreComercial: body.nombre_comercial ?? null,
      razonSocial: body.razon_social ?? null,
      cuit: body.cuit ?? null,
      domicilio: body.domicilio ?? null,
      telefono: body.telefono ?? null,
      email: body.email ?? null,
      sitioWeb: body.sitio_web ?? null,
      mensajePie: body.mensaje_pie ?? null,
    };

    const [row] = await db
      .insert(receiptSettings)
      .values(values)
      .onConflictDoUpdate({
        target: receiptSettings.tenantId,
        set: {
          ...values,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json(toResponse(row));
  });
}

function toResponse(r: typeof receiptSettings.$inferSelect) {
  return {
    id: r.id,
    tenant_id: r.tenantId,
    habilitado: r.habilitado,
    mostrar_dialogo: r.mostrarDialogo,
    impresion_automatica: r.impresionAutomatica,
    descarga_automatica: r.descargaAutomatica,
    tipo_comprobante: r.tipoComprobante,
    prefijo_numeracion: r.prefijoNumeracion,
    proximo_numero: r.proximoNumero,
    logo_url: r.logoUrl,
    nombre_comercial: r.nombreComercial,
    razon_social: r.razonSocial,
    cuit: r.cuit,
    domicilio: r.domicilio,
    telefono: r.telefono,
    email: r.email,
    sitio_web: r.sitioWeb,
    mensaje_pie: r.mensajePie,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}
