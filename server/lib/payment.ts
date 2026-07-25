/**
 * server/lib/payment.ts
 *
 * Función central de registro de pagos.
 *
 * ÚNICA función que debe llamarse para:
 *   - registrar un pago manual
 *   - actualizar la licencia a "activa"
 *   - extender expires_at + lastPaymentAt
 *   - mantener business_settings en sincronía (visual)
 *   - generar log de auditoría
 *
 * No implementa integración con gateway externo. Cuando llegue Mercado Pago / Stripe,
 * el webhook de confirmación debe llamar a processPayment() internamente.
 */

import { db } from "../db";
import { licenses, businessSettings } from "@shared/schema";
import type { LicenseStatus } from "@shared/schema";
import { logEvent } from "./logger";

const CYCLE_DAYS = 30;

export interface PaymentResult {
  expiresAt: Date;
  lastPaymentAt: Date;
}

/**
 * Registra un pago y activa/extiende la licencia del comercio.
 *
 * @param ownerId      - ID del propietario del negocio
 * @param callerUserId - ID del usuario que ejecuta la acción (para auditoría)
 * @param cycleDays    - Duración del ciclo en días (default: 30)
 */
export async function processPayment(
  ownerId: string,
  callerUserId: string | null,
  cycleDays: number = CYCLE_DAYS,
): Promise<PaymentResult> {
  const now = new Date();
  const end = new Date(now.getTime() + cycleDays * 24 * 60 * 60 * 1000);

  // ── 1. Actualizar business_settings (datos visuales de facturación) ──────────
  await db
    .insert(businessSettings)
    .values({
      ownerId,
      nombreNegocio: "",
      lastPaymentDate: now,
      billingCycleStart: now,
      billingCycleEnd: end,
      subscriptionStatus: "active",
    })
    .onConflictDoUpdate({
      target: businessSettings.ownerId,
      set: {
        lastPaymentDate: now,
        billingCycleStart: now,
        billingCycleEnd: end,
        subscriptionStatus: "active",
        updatedAt: now,
      },
    });

  // ── 2. Actualizar licenses (fuente de verdad de acceso) ──────────────────────
  await db
    .insert(licenses)
    .values({
      ownerId,
      status: "activa" as LicenseStatus,
      activatedAt: now,
      expiresAt: end,
      lastPaymentAt: now,
    })
    .onConflictDoUpdate({
      target: licenses.ownerId,
      set: {
        status: "activa" as LicenseStatus,
        activatedAt: now,
        expiresAt: end,
        lastPaymentAt: now,
        updatedAt: now,
      },
    });

  // ── 3. Auditoría ─────────────────────────────────────────────────────────────
  logEvent({
    module: "admin",
    event: "PAYMENT_PROCESSED",
    level: "info",
    message: "Pago procesado — licencia extendida",
    ownerId,
    userId: callerUserId,
    details: { cycleEnd: end.toISOString(), cycleDays, targetOwnerId: ownerId },
  });

  return { expiresAt: end, lastPaymentAt: now };
}
