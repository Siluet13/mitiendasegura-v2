import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { PwaInstallDialog } from "@/components/PwaInstallDialog";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Ingresar" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const { canPrompt, platform, isStandalone, prompt } = usePwaInstall();
  const [showInstructions, setShowInstructions] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  const showInstallButton = !isStandalone;

  const handleInstall = async () => {
    if (canPrompt) {
      await prompt();
    } else {
      setShowInstructions(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Mi Tienda Segura</CardTitle>
          <CardDescription>Ingresá con tu cuenta para continuar</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button className="w-full" asChild>
            <a href="/api/login">Ingresar</a>
          </Button>
          {showInstallButton && (
            <Button variant="outline" className="w-full" onClick={handleInstall}>
              <Download className="mr-2 h-4 w-4" />
              Instalar App
            </Button>
          )}
        </CardContent>
      </Card>

      {showInstructions && platform && platform !== null && (
        <PwaInstallDialog
          platform={platform}
          open={showInstructions}
          onClose={() => setShowInstructions(false)}
        />
      )}
    </div>
  );
}
