import { z } from "zod";

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

export const authApi = {
  async signOut() {
    window.location.href = "/api/logout";
  },
};
