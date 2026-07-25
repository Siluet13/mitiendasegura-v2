/**
 * BillingBanner — aviso contextual de estado de licencia.
 *
 * Fuente de datos: LicenseState (de useLicense → /api/license/status).
 * NO usa business_settings ni useBilling.
 *
 * Reglas:
 *   - permanente  → nunca mostrar nada (MASTER_ADMIN_ID)
 *   - activa      → mostrar aviso solo si faltan ≤5 días para expirar
 *   - demo        → mostrar aviso informativo con días restantes
 *   - gracia      → mostrar aviso urgente con días antes del bloqueo
 *   - vencida/suspendida → LicenseBlock ya cubre pantalla; no se alcanza este componente
 *   - null/loading → no mostrar nada (nunca bloquear por estado pendiente)
 */
import type { LicenseState } from "@/hooks/useLicense";

interface Props {
  license: LicenseState | null;
}

function daysLeft(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function BillingBanner({ license }: Props) {
  if (!license) return null;

  // MASTER_ADMIN_ID — nunca ver avisos de vencimiento
  if (license.status === "permanente") return null;

  if (license.status === "demo") {
    const days = daysLeft(license.demoEndsAt);
    return (
      <div className="w-full bg-blue-50 border-b border-blue-200 px-4 py-1.5 text-center text-sm text-blue-800">
        Estás usando <span className="font-semibold">Mi Tienda Segura</span> en período de prueba
        {days !== null && (
          <>
            {". "}Tu demo vence en{" "}
            <span className="font-semibold">
              {days <= 0 ? "menos de 1 día" : `${days} ${days === 1 ? "día" : "días"}`}
            </span>
          </>
        )}
        .
      </div>
    );
  }

  if (license.status === "gracia") {
    const days = daysLeft(license.graceEndsAt);
    return (
      <div className="w-full bg-orange-50 border-b border-orange-200 px-4 py-1.5 text-center text-sm text-orange-800">
        Tu licencia venció.{" "}
        {days !== null && days > 0 ? (
          <>
            Tenés{" "}
            <span className="font-semibold">
              {days} {days === 1 ? "día" : "días"}
            </span>{" "}
            para renovarla antes del bloqueo.{" "}
          </>
        ) : (
          "El período de gracia está por terminar. "
        )}
        <span className="font-semibold">Contactá al administrador</span> para renovarla.
      </div>
    );
  }

  if (license.status === "activa") {
    const days = daysLeft(license.expiresAt);
    if (days === null || days > 5) return null;
    return (
      <div className="w-full bg-yellow-50 border-b border-yellow-200 px-4 py-1.5 text-center text-sm text-yellow-800">
        Tu licencia vence en{" "}
        <span className="font-semibold">
          {days <= 0 ? "menos de 1 día" : `${days} ${days === 1 ? "día" : "días"}`}
        </span>
        . Contactá al administrador para renovarla.
      </div>
    );
  }

  // vencida / suspendida — LicenseBlock cubre pantalla; este componente no se alcanza
  // en condiciones normales, pero si se llegara, mostrar aviso genérico
  if (license.status === "vencida" || license.status === "suspendida") {
    return (
      <div className="w-full bg-red-50 border-b border-red-200 px-4 py-1.5 text-center text-sm text-red-800">
        Tu licencia ha vencido o fue suspendida.{" "}
        <span className="font-semibold">Contactá al administrador</span> para reactivarla.
      </div>
    );
  }

  return null;
}
