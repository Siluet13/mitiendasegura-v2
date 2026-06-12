import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nueva contraseña" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}
