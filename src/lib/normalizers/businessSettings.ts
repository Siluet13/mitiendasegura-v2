export interface NormalizedBusinessSettings {
  subscriptionStatus: string;
  billingCycleStart: Date | null;
  billingCycleEnd: Date | null;
  lastPaymentDate: Date | null;
}

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

export function normalizeBusinessSettings(raw: unknown): NormalizedBusinessSettings {
  const r = (raw != null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const subscriptionStatus =
    (pick(r, "subscriptionStatus", "subscription_status") as string | null | undefined) ??
    "active";

  const billingCycleStart = toDate(pick(r, "billingCycleStart", "billing_cycle_start"));
  const billingCycleEnd = toDate(pick(r, "billingCycleEnd", "billing_cycle_end"));
  const lastPaymentDate = toDate(pick(r, "lastPaymentDate", "last_payment_date"));

  return { subscriptionStatus, billingCycleStart, billingCycleEnd, lastPaymentDate };
}
