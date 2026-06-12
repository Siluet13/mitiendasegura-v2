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

async function fetchUser(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/user", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

export function useAuth(): AuthState {
  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  return { user, loading: isLoading };
}
