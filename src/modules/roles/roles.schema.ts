import { z } from "zod";

export const roleIdParamSchema = z.object({
  id: z.coerce.number().int().positive("El ID del rol debe ser un número entero positivo"),
});

export const updateRolePermissionsSchema = z.object({
  permisoIds: z.array(z.coerce.number().int().positive("Cada ID de permiso debe ser un entero positivo")),
});

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;