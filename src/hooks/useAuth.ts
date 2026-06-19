import { useQuery } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

const USER_CACHE_KEY = "mts_cached_user";

function saveUser(user: AuthUser): void {
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {}
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function clearCachedUser(): void {
  try {
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {}
}

function isOfflineError(e: unknown): boolean {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return true;
  }
  return e instanceof TypeError;
}

async function fetchUser(): Promise<AuthUser | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return loadUser();
  }
  try {
    const signal = AbortSignal?.timeout?.(8000);
    const res = await fetch("/api/auth/user", { credentials: "include", signal });
    if (res.status === 401) {
      clearCachedUser();
      return null;
    }
    if (!res.ok) throw new Error("Failed to fetch user");
    const user = (await res.json()) as AuthUser;
    saveUser(user);
    return user;
  } catch (e) {
    if (isOfflineError(e)) return loadUser();
    throw e;
  }
}

export function useAuth(): AuthState {
  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
    initialData: (): AuthUser | null | undefined => {
      if (typeof window === "undefined") return undefined;
      return loadUser() ?? undefined;
    },
    initialDataUpdatedAt: 0,
  });

  return { user, loading: isLoading };
}
