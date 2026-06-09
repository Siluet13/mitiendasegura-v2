import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { authApi, forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/auth";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Recuperar contraseña" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { user, loading } = useAuth();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(values: ForgotPasswordInput) {
    try {
      await authApi.sendPasswordReset(values);
      toast.success("Te enviamos un email con instrucciones.");
      form.reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al enviar el email");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>Ingresá tu email para recibir el link de recuperación</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Enviando..." : "Enviar email"}
              </Button>
            </form>
          </Form>
          <p className="mt-4 text-sm text-muted-foreground">
            <Link to="/login" className="hover:underline">Volver a ingresar</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
