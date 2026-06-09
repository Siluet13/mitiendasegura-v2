import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { authApi, registerSchema, type RegisterInput } from "@/lib/auth";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Registro" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { nombre: "", email: "", password: "" },
  });

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(values: RegisterInput) {
    try {
      await authApi.signUp(values);
      toast.success("Cuenta creada. Revisá tu email para confirmar.");
      navigate({ to: "/login" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>Registrate para empezar</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="nombre" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl><Input autoComplete="name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creando..." : "Crear cuenta"}
              </Button>
            </form>
          </Form>
          <p className="mt-4 text-sm text-muted-foreground">
            ¿Ya tenés cuenta?{" "}
            <Link to="/login" className="text-foreground hover:underline">Ingresá</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
