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

export function normalizeBusinessSettings(raw: unknown): NormalizedBusinessSettings {
  const r = (raw != null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const subscriptionStatus =
    (r.subscriptionStatus as string | null | undefined) ?? "active";

  return {
    subscriptionStatus,
    billingCycleStart: toDate(r.billingCycleStart),
    billingCycleEnd: toDate(r.billingCycleEnd),
    lastPaymentDate: toDate(r.lastPaymentDate),
  };
}
