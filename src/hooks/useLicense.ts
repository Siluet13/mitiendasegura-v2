import { useQuery } from "@tanstack/react-query";

export type LicenseStatus = "activa" | "pendiente" | "suspendida" | "vencida";

export interface LicenseState {
  status: LicenseStatus;
  activatedAt: string | null;
  expiresAt: string | null;
  suspendedAt: string | null;
}

async function fetchLicenseStatus(): Promise<LicenseState> {
  const res = await fetch("/api/license/status", { credentials: "include" });
  if (!res.ok) return { status: "pendiente", activatedAt: null, expiresAt: null, suspendedAt: null };
  return res.json();
}

export function useLicense() {
  const { data, isLoading } = useQuery<LicenseState>({
    queryKey: ["/api/license/status"],
    queryFn: fetchLicenseStatus,
    staleTime: 1000 * 60,
    retry: false,
  });

  return {
    license: data ?? null,
    licenseLoading: isLoading,
    isActive: data?.status === "activa",
  };
}
