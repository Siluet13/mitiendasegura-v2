import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Ingresar" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Mi Tienda Segura</CardTitle>
          <CardDescription>Ingresá con tu cuenta para continuar</CardDescription>
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
