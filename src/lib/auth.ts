import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// ---- Zod schemas ---------------------------------------------------------
export const loginSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  nombre: z.string().trim().min(1, "Requerido").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---- Centralized Supabase auth calls -------------------------------------
export const authApi = {
  async signIn(input: LoginInput) {
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) throw error;
  },

  async signUp(input: RegisterInput) {
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { nombre: input.nombre },
      },
    });
    if (error) throw error;
  },

  async sendPasswordReset(input: ForgotPasswordInput) {
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },

  async updatePassword(input: ResetPasswordInput) {
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) throw error;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
