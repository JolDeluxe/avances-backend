import { z } from "zod";

export const loginSchema = z.object({
  usuario: z.string().min(3, "El nombre de usuario es requerido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "La contraseña actual es requerida"),
  newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
