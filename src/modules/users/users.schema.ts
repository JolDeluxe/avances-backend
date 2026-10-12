import { z } from "zod";

export const createUserSchema = z.object({
  usuario: z
    .string()
    .min(3, "El nombre de usuario debe tener al menos 3 caracteres")
    .max(50, "El nombre de usuario no debe exceder 50 caracteres")
    .regex(/^[a-zA-Z0-9_.-]+$/, "El usuario solo puede contener letras, números, puntos, guiones y guiones bajos"),
  nombre: z
    .string()
    .min(2, "El nombre completo debe tener al menos 2 caracteres")
    .max(120, "El nombre no debe exceder 120 caracteres"),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña no debe exceder 100 caracteres"),
  rolId: z.coerce.number().int().positive("Debe seleccionar un rol válido"),
  departamentoId: z.coerce.number().int().positive("Debe seleccionar un departamento válido"),
  tipoSurtidoAlmacen: z.string().max(100).nullable().optional(),
  tipoMaterialAuditor: z.string().max(100).nullable().optional(),
  lineaProduccionIds: z.array(z.coerce.number().int().positive()).optional(),
  excepciones: z
    .array(
      z.object({
        permisoId: z.coerce.number().int().positive("El ID del permiso debe ser válido"),
        accion: z.literal("CONCEDER", {
          errorMap: () => ({ message: "Solo se permiten excepciones positivas (CONCEDER)" }),
        }),
      }),
    )
    .optional(),
});

export const updateUserSchema = z.object({
  nombre: z
    .string()
    .min(2, "El nombre completo debe tener al menos 2 caracteres")
    .max(120, "El nombre no debe exceder 120 caracteres")
    .optional(),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña no debe exceder 100 caracteres")
    .optional(),
  rolId: z.coerce.number().int().positive().optional(),
  departamentoId: z.coerce.number().int().positive().optional(),
  tipoSurtidoAlmacen: z.string().max(100).nullable().optional(),
  tipoMaterialAuditor: z.string().max(100).nullable().optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]).optional(),
  lineaProduccionIds: z.array(z.coerce.number().int().positive()).optional(),
  excepciones: z
    .array(
      z.object({
        permisoId: z.coerce.number().int().positive("El ID del permiso debe ser válido"),
        accion: z.literal("CONCEDER", {
          errorMap: () => ({ message: "Solo se permiten excepciones positivas (CONCEDER)" }),
        }),
      }),
    )
    .optional(),
});

export const filterUsersSchema = z.object({
  departamentoId: z.coerce.number().int().positive().optional(),
  rolId: z.coerce.number().int().positive().optional(),
  tipoSurtidoAlmacen: z.string().optional(),
  tipoMaterialAuditor: z.string().max(100).optional(),
  estado: z.enum(["ACTIVO", "INACTIVO", "TODOS"]).optional().default("ACTIVO"),
  busqueda: z.string().optional(),
  pagina: z.coerce.number().int().positive().optional().default(1),
  limite: z.coerce.number().int().positive().max(100).optional().default(50),
});

export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña no debe exceder 100 caracteres"),
});

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive("El ID del usuario debe ser un número entero positivo"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type FilterUsersInput = z.input<typeof filterUsersSchema>;
export type FilterUsersQuery = z.infer<typeof filterUsersSchema>;

