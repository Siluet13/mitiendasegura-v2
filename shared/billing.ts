const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type BillingStatusCode = "active" | "warning" | "expired";

export interface BillingStatus {
  status: BillingStatusCode;
  daysLeft: number;
  isActive: boolean;
  billingCycleEnd: Date;
  billingCycleStart: Date;
  lastPaymentDate: Date | null;
}

interface BillingInput {
  billing_cycle_end: Date | string | null | undefined;
  billing_cycle_start: Date | string | null | undefined;
  last_payment_date: Date | string | null | undefined;
}

export function getBillingStatus(settings: BillingInput): BillingStatus {
  const now = Date.now();

  const cycleEnd = toDate(settings.billing_cycle_end);
  const cycleStart = toDate(settings.billing_cycle_start);
  const lastPayment = toDate(settings.last_payment_date);

  if (!cycleEnd) {
    return {
      status: "expired",
      daysLeft: 0,
      isActive: false,
      billingCycleEnd: new Date(0),
      billingCycleStart: cycleStart ?? new Date(0),
      lastPaymentDate: lastPayment,
    };
  }

  const rawDays = (cycleEnd.getTime() - now) / MS_PER_DAY;
  const daysLeft = Number.isFinite(rawDays) ? Math.ceil(rawDays) : 0;

  let status: BillingStatusCode;
  if (daysLeft > 5) {
    status = "active";
  } else if (daysLeft > 0) {
    status = "warning";
  } else {
    status = "expired";
  }

  return {
    status,
    daysLeft,
    isActive: daysLeft > 0,
    billingCycleEnd: cycleEnd,
    billingCycleStart: cycleStart ?? new Date(0),
    lastPaymentDate: lastPayment,
  };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
