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

export interface CashSession {
  id: string;
  tenant_id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  initial_amount: string;
  final_amount: string | null;
  total_sales: string | null;
  status: "open" | "closed";
  current_total: number;
}

export async function getCashSession(): Promise<CashSession | null> {
  return apiFetch("/api/cash/current");
}

export async function openCash(initialAmount: number): Promise<CashSession> {
  return apiFetch("/api/cash/open", {
    method: "POST",
    body: JSON.stringify({ initial_amount: initialAmount }),
  });
}

export async function closeCash(): Promise<CashSession> {
  return apiFetch("/api/cash/close", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
