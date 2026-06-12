import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Registro" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>Registrate para empezar</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" asChild>
            <a href="/api/login">Ingresar / Registrarse</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
