import type { BillingStatus } from "@shared/billing";

interface Props {
  billing: BillingStatus | null;
}

export function BillingBanner({ billing }: Props) {
  if (!billing || billing.status === "active") return null;

  if (billing.status === "warning") {
    return (
      <div className="w-full bg-yellow-50 border-b border-yellow-200 px-4 py-1.5 text-center text-sm text-yellow-800">
        Tu suscripción vence en{" "}
        <span className="font-semibold">{billing.daysLeft} {billing.daysLeft === 1 ? "día" : "días"}</span>.
        Contactá al administrador para renovarla.
      </div>
    );
  }

  return (
    <div className="w-full bg-red-50 border-b border-red-200 px-4 py-1.5 text-center text-sm text-red-800">
      Tu suscripción ha vencido.{" "}
      <span className="font-semibold">Contactá al administrador</span> para reactivarla.
    </div>
  );
}
