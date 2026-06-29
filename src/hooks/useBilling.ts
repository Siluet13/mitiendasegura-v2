import { useQuery } from "@tanstack/react-query";
import { getBusinessSettings } from "@/lib/api/settings";
import { getBillingStatus, type BillingStatus } from "@shared/billing";

export function useBilling(): { billing: BillingStatus | null } {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: getBusinessSettings,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (!data) return { billing: null };

  const raw = data as unknown as Record<string, unknown>;

  const billing_cycle_end =
    (raw.billing_cycle_end ?? raw.billingCycleEnd ?? null) as Date | string | null;
  const billing_cycle_start =
    (raw.billing_cycle_start ?? raw.billingCycleStart ?? null) as Date | string | null;
  const last_payment_date =
    (raw.last_payment_date ?? raw.lastPaymentDate ?? null) as Date | string | null;

  return {
    billing: getBillingStatus({ billing_cycle_end, billing_cycle_start, last_payment_date }),
  };
}
