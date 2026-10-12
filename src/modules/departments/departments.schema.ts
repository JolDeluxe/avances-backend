import { z } from "zod";

export const createDepartmentSchema = z.object({
  codigo: z
    .string()
    .min(2, "El código debe tener al menos 2 caracteres")
    .max(30, "El código no debe exceder 30 caracteres")
    .regex(/^[A-Z0-9_-]+$/, "El código solo puede contener letras mayúsculas, números, guiones y guiones bajos"),
  nombre: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no debe exceder 100 caracteres"),
});

export const updateDepartmentSchema = z.object({
  nombre: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no debe exceder 100 caracteres")
    .optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]).optional(),
});

export const createLineSchema = z.object({
  codigo: z
    .string()
    .min(2, "El código de la línea debe tener al menos 2 caracteres")
    .max(30, "El código de la línea no debe exceder 30 caracteres")
    .regex(/^[A-Z0-9_-]+$/, "El código solo puede contener letras mayúsculas, números, guiones y guiones bajos")
    .optional(),
  nombre: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no debe exceder 100 caracteres"),
  area: z.enum(["BOTA", "ACCESORIOS"]).optional(),
});

export const updateLineSchema = z.object({
  nombre: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no debe exceder 100 caracteres")
    .optional(),
  area: z.enum(["BOTA", "ACCESORIOS"]).optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]).optional(),
});

export const reorderLineasSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number().int().positive("El ID de la línea debe ser un entero positivo"),
        orden: z.number().int().min(0, "El orden debe ser mayor o igual a 0"),
      }),
    )
    .min(1, "Debe enviar al menos una línea para reordenar"),
});

export const departmentIdParamSchema = z.object({
  id: z.coerce.number().int().positive("El ID del departamento debe ser un número entero positivo"),
});

export const lineIdParamSchema = z.object({
  lineId: z.coerce.number().int().positive("El ID de la línea debe ser un número entero positivo"),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type CreateLineInput = z.infer<typeof createLineSchema>;
export type UpdateLineInput = z.infer<typeof updateLineSchema>;
export type ReorderLineasInput = z.infer<typeof reorderLineasSchema>;
