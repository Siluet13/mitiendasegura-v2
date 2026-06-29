import { businessSettings } from "@shared/schema";

type BusinessSettingsRow = typeof businessSettings.$inferSelect;

export function normalizeBusinessSettingsResponse(s: BusinessSettingsRow) {
  return {
    id: s.id,
    ownerId: s.ownerId,
    nombreNegocio: s.nombreNegocio,
    razonSocial: s.razonSocial,
    telefono: s.telefono,
    email: s.email,
    direccion: s.direccion,
    ciudad: s.ciudad,
    provincia: s.provincia,
    pais: s.pais,
    moneda: s.moneda,
    simboloMoneda: s.simboloMoneda,
    decimales: s.decimales,
    logoUrl: s.logoUrl,
    mensajeTickets: s.mensajeTickets,
    observaciones: s.observaciones,
    subscriptionStatus: s.subscriptionStatus,
    billingCycleStart: s.billingCycleStart.toISOString(),
    billingCycleEnd: s.billingCycleEnd.toISOString(),
    lastPaymentDate: s.lastPaymentDate?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export type BusinessSettingsResponse = ReturnType<typeof normalizeBusinessSettingsResponse>;
