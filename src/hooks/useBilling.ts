import { useQuery } from "@tanstack/react-query";
import { getBusinessSettings } from "@/lib/api/settings";
import { getBillingStatus, type BillingStatus } from "@shared/billing";
import { normalizeBusinessSettings } from "@/lib/normalizers/businessSettings";

export function useBilling(): { billing: BillingStatus | null } {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: getBusinessSettings,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (!data) return { billing: null };

  const settings = normalizeBusinessSettings(data);

  return {
    billing: getBillingStatus({
      billing_cycle_end: settings.billingCycleEnd,
      billing_cycle_start: settings.billingCycleStart,
      last_payment_date: settings.lastPaymentDate,
    }),
  };
}
