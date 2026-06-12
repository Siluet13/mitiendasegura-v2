import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Recuperar contraseña" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>Usá el botón de abajo para ingresar y gestionar tu cuenta</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" asChild>
            <a href="/api/login">Ingresar</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
