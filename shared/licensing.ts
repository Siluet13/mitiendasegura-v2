/**
 * shared/licensing.ts
 *
 * FUENTE ÚNICA DE VERDAD sobre qué estados de licencia permiten acceso al sistema.
 *
 * Centralizar aquí garantiza que middleware, endpoints y frontend usen
 * exactamente la misma lógica. No duplicar esta lógica en ningún otro lugar.
 *
 * Regla fundamental:
 *   - MASTER_ADMIN_ID siempre tiene status = "permanente"
 *   - "permanente" nunca puede ser asignado a un cliente normal
 *   - El bypass de MASTER_ADMIN_ID se aplica en TODOS los puntos de control
 */

export type LicenseStatus =
  | "activa"      // licencia activa pagada
  | "permanente"  // MASTER_ADMIN_ID — nunca bloqueable por ningún proceso
  | "demo"        // período de demo gratuito (Fase 2)
  | "gracia"      // período de gracia post-vencimiento (Fase 2)
  | "pendiente"   // cuenta creada, sin licencia asignada aún
  | "suspendida"  // bloqueada manualmente por admin
  | "vencida";    // venció sin renovar

/**
 * Estados que conceden acceso pleno al sistema.
 * Fase 1: solo "activa" y "permanente".
 * Fase 2 agregará "demo" y "gracia" con su lógica de fechas.
 */
export const ACCESS_STATUSES: readonly LicenseStatus[] = [
  "activa",
  "permanente",
  // "demo" y "gracia" se habilitarán en Fase 2
];

/**
 * Retorna true si el estado de licencia permite usar la aplicación.
 * Usar esta función en TODOS los puntos de control de acceso.
 */
export function isLicenseActive(status: string | null | undefined): boolean {
  if (!status) return false;
  return (ACCESS_STATUSES as readonly string[]).includes(status);
}
