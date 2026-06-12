import type { LicenseStatus } from "@/hooks/useLicense";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  return res.json();
}

export interface BusinessRow {
  ownerId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  registeredAt: string | null;
  licenseStatus: LicenseStatus;
  licenseActivatedAt: string | null;
  licenseExpiresAt: string | null;
  licenseNotes: string | null;
  nombreNegocio: string | null;
  productCount: number;
  customerCount: number;
  saleCount: number;
  lastSaleAt: string | null;
}

export async function getAdminMe(): Promise<{ isAdmin: boolean }> {
  return apiFetch("/api/admin/me");
}

export async function listBusinesses(): Promise<BusinessRow[]> {
  return apiFetch("/api/admin/businesses");
}

export async function updateLicense(
  ownerId: string,
  input: { status: LicenseStatus; notes?: string; expiresAt?: string | null }
): Promise<void> {
  await apiFetch(`/api/admin/licenses/${ownerId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
