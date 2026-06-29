import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTenant } from "../lib/context";
import { broadcast } from "../lib/events";
import { businessSettings } from "@shared/schema";

export function registerSettingsRoutes(app: Express): void {
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    const { userId } = requireTenant(req);
    const [row] = await db
      .select()
      .from(businessSettings)
      .where(eq(businessSettings.ownerId, userId));
    res.json(row ?? null);
  });

  app.put("/api/settings", isAuthenticated, async (req, res) => {
    const { userId, tenantId } = requireTenant(req);
    const body = req.body;

    const clientDateHeader = req.headers["x-if-unmodified-since"];
    if (clientDateHeader && typeof clientDateHeader === "string") {
      const clientDate = new Date(clientDateHeader);
      if (!isNaN(clientDate.getTime())) {
        const [current] = await db
          .select({ updatedAt: businessSettings.updatedAt })
          .from(businessSettings)
          .where(eq(businessSettings.ownerId, userId));
        if (current && current.updatedAt > clientDate) {
          return res.status(409).json({ message: "Conflict" });
        }
      }
    }

    const [row] = await db
      .insert(businessSettings)
      .values({
        ownerId: userId,
        nombreNegocio: body.nombre_negocio,
        razonSocial: body.razon_social ?? null,
        telefono: body.telefono ?? null,
        email: body.email ?? null,
        direccion: body.direccion ?? null,
        ciudad: body.ciudad ?? null,
        provincia: body.provincia ?? null,
        pais: body.pais ?? null,
        moneda: body.moneda ?? "ARS",
        simboloMoneda: body.simbolo_moneda ?? "$",
        decimales: body.decimales ?? 2,
        logoUrl: body.logo_url ?? null,
        mensajeTickets: body.mensaje_tickets ?? null,
        observaciones: body.observaciones ?? null,
      })
      .onConflictDoUpdate({
        target: businessSettings.ownerId,
        set: {
          nombreNegocio: body.nombre_negocio,
          razonSocial: body.razon_social ?? null,
          telefono: body.telefono ?? null,
          email: body.email ?? null,
          direccion: body.direccion ?? null,
          ciudad: body.ciudad ?? null,
          provincia: body.provincia ?? null,
          pais: body.pais ?? null,
          moneda: body.moneda ?? "ARS",
          simboloMoneda: body.simbolo_moneda ?? "$",
          decimales: body.decimales ?? 2,
          logoUrl: body.logo_url ?? null,
          mensajeTickets: body.mensaje_tickets ?? null,
          observaciones: body.observaciones ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (tenantId) {
      broadcast(tenantId, { type: "invalidate", entities: ["business_settings"] });
    }

    res.json(toResponse(row));
  });
}

function toResponse(s: typeof businessSettings.$inferSelect) {
  return {
    id: s.id,
    owner_id: s.ownerId,
    nombre_negocio: s.nombreNegocio,
    razon_social: s.razonSocial,
    telefono: s.telefono,
    email: s.email,
    direccion: s.direccion,
    ciudad: s.ciudad,
    provincia: s.provincia,
    pais: s.pais,
    moneda: s.moneda,
    simbolo_moneda: s.simboloMoneda,
    decimales: s.decimales,
    logo_url: s.logoUrl,
    mensaje_tickets: s.mensajeTickets,
    observaciones: s.observaciones,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}
