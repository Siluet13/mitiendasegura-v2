import { useQuery } from "@tanstack/react-query";
import type { LicenseStatus } from "@shared/licensing";
import { isLicenseActive } from "@shared/licensing";

export type { LicenseStatus };

export interface LicenseState {
  status: LicenseStatus;
  activatedAt: string | null;
  expiresAt: string | null;
  suspendedAt: string | null;
  demoEndsAt: string | null;
  graceEndsAt: string | null;
  lastPaymentAt: string | null;
}

const LICENSE_CACHE_KEY = "mts_cached_license";

const OFFLINE_DEFAULT: LicenseState = {
  status: "activa",
  activatedAt: null,
  expiresAt: null,
  suspendedAt: null,
  demoEndsAt: null,
  graceEndsAt: null,
  lastPaymentAt: null,
};

function saveLicense(license: LicenseState): void {
  try {
    localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(license));
  } catch {}
}

function loadLicense(): LicenseState | null {
  try {
    const raw = localStorage.getItem(LICENSE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as LicenseState) : null;
  } catch {
    return null;
  }
}

function isOfflineError(e: unknown): boolean {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return true;
  }
  return e instanceof TypeError;
}

async function fetchLicenseStatus(): Promise<LicenseState> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return loadLicense() ?? OFFLINE_DEFAULT;
  }
  try {
    const signal = AbortSignal?.timeout?.(8000);
    const res = await fetch("/api/license/status", { credentials: "include", signal });
    if (!res.ok) return { status: "pendiente", activatedAt: null, expiresAt: null, suspendedAt: null, demoEndsAt: null, graceEndsAt: null, lastPaymentAt: null };
    const license = (await res.json()) as LicenseState;
    saveLicense(license);
    return license;
  } catch (e) {
    if (isOfflineError(e)) return loadLicense() ?? OFFLINE_DEFAULT;
    throw e;
  }
}

export function useLicense() {
  const { data, isLoading } = useQuery<LicenseState>({
    queryKey: ["/api/license/status"],
    queryFn: fetchLicenseStatus,
    staleTime: 1000 * 60,
    retry: false,
    initialData: (): LicenseState | undefined => {
      if (typeof window === "undefined") return undefined;
      const cached = loadLicense();
      // No usar "pendiente" como initialData: ese estado se convierte a "demo"
      // en el primer call al servidor. Usarlo causaría un flash de "Acceso
      // restringido" mientras el refetch completa.
      if (cached?.status === "pendiente") return undefined;
      return cached ?? undefined;
    },
    initialDataUpdatedAt: 0,
  });

  return {
    license: data ?? null,
    licenseLoading: isLoading,
    isActive: isLicenseActive(data?.status),
  };
}
