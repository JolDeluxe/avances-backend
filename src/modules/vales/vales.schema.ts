import { z } from "zod";

/**
 * Normaliza cadenas de catálogos y folios:
 * - elimina espacios al inicio y final
 * - colapsa espacios múltiples internos a uno solo
 * - convierte a MAYÚSCULAS
 */
export function normalizeCatalogCode(val: string): string {
  return val.trim().replace(/\s+/g, " ").toUpperCase();
}

export const areaValeEnum = z.enum(["BOTA", "ACCESORIOS", "OTRO"], {
  errorMap: () => ({ message: "El área debe ser BOTA, ACCESORIOS u OTRO" }),
});

export const estadoValeEnum = z.enum([
  "PENDIENTE",
  "SEPARADO",
  "ENTREGADO",
  "DESCONTADO",
  "CANCELADO",
]);

export const createValeSchema = z
  .object({
    departamentoId: z.coerce.number().int().positive().optional(),
    serieId: z.coerce.number().int().positive().optional(),
    nuevaSerie: z
      .string()
      .transform(normalizeCatalogCode)
      .pipe(
        z
          .string()
          .min(2, "La serie debe tener al menos 2 caracteres")
          .max(20, "La serie no debe exceder 20 caracteres")
          .regex(
            /^[A-Z0-9_ -]+$/,
            "La serie solo puede contener letras, números, espacios, guiones y guiones bajos",
          ),
      )
      .optional(),
    folio: z
      .string()
      .transform(normalizeCatalogCode)
      .pipe(
        z
          .string()
          .min(1, "El folio es obligatorio")
          .max(30, "El folio no debe exceder 30 caracteres")
          .regex(
            /^[A-Z0-9_/-]+$/,
            "El folio solo puede contener caracteres alfanuméricos, guiones o diagonales",
          ),
      ),
    departamentoValeId: z.coerce.number().int().positive().optional(),
    nuevoDepartamento: z
      .string()
      .transform(normalizeCatalogCode)
      .pipe(
        z
          .string()
          .min(2, "El nombre del departamento operativo debe tener al menos 2 caracteres")
          .max(60, "El nombre del departamento operativo no debe exceder 60 caracteres"),
      )
      .optional(),
    area: areaValeEnum.optional(),
    fechaSolicitud: z
      .string()
      .trim()
      .min(1, "La fecha de solicitud es obligatoria")
      .refine((val) => !Number.isNaN(Date.parse(val)), {
        message: "La fecha de solicitud no tiene un formato válido",
      }),
    horaSolicitud: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "La hora debe tener formato HH:mm (24h)")
      .optional()
      .nullable(),
    tieneHoraSolicitud: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.serieId && !data.nuevaSerie) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serieId"],
        message: "Debe seleccionar una serie existente o escribir una nueva serie",
      });
    }
    if (data.serieId && data.nuevaSerie) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nuevaSerie"],
        message: "No puede enviar serieId y nuevaSerie simultáneamente",
      });
    }
    if (!data.departamentoValeId && !data.nuevoDepartamento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departamentoValeId"],
        message: "Debe seleccionar un departamento operativo o escribir uno nuevo",
      });
    }
    if (data.departamentoValeId && data.nuevoDepartamento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nuevoDepartamento"],
        message: "No puede enviar departamentoValeId y nuevoDepartamento simultáneamente",
      });
    }
    if (data.nuevoDepartamento && !data.area) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["area"],
        message: "Al registrar un departamento nuevo debe especificar su clasificación (BOTA, ACCESORIOS u OTRO)",
      });
    }
  });

export const updateValeSchema = z
  .object({
    serieId: z.coerce.number().int().positive().optional(),
    nuevaSerie: z
      .string()
      .transform(normalizeCatalogCode)
      .pipe(
        z
          .string()
          .min(2, "La serie debe tener al menos 2 caracteres")
          .max(20, "La serie no debe exceder 20 caracteres")
          .regex(
            /^[A-Z0-9_ -]+$/,
            "La serie solo puede contener letras, números, espacios, guiones y guiones bajos",
          ),
      )
      .optional(),
    folio: z
      .string()
      .transform(normalizeCatalogCode)
      .pipe(
        z
          .string()
          .min(1, "El folio es obligatorio")
          .max(30, "El folio no debe exceder 30 caracteres")
          .regex(
            /^[A-Z0-9_/-]+$/,
            "El folio solo puede contener caracteres alfanuméricos, guiones o diagonales",
          ),
      )
      .optional(),
    departamentoValeId: z.coerce.number().int().positive().optional(),
    nuevoDepartamento: z
      .string()
      .transform(normalizeCatalogCode)
      .pipe(
        z
          .string()
          .min(2, "El nombre del departamento operativo debe tener al menos 2 caracteres")
          .max(60, "El nombre del departamento operativo no debe exceder 60 caracteres"),
      )
      .optional(),
    area: areaValeEnum.optional(),
    fechaSolicitud: z
      .string()
      .trim()
      .refine((val) => !Number.isNaN(Date.parse(val)), {
        message: "La fecha de solicitud no tiene un formato válido",
      })
      .optional(),
    horaSolicitud: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "La hora debe tener formato HH:mm (24h)")
      .optional()
      .nullable(),
    tieneHoraSolicitud: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.serieId && data.nuevaSerie) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nuevaSerie"],
        message: "No puede enviar serieId y nuevaSerie simultáneamente",
      });
    }
    if (data.departamentoValeId && data.nuevoDepartamento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nuevoDepartamento"],
        message: "No puede enviar departamentoValeId y nuevoDepartamento simultáneamente",
      });
    }
    if (data.nuevoDepartamento && !data.area) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["area"],
        message: "Al registrar un departamento nuevo debe especificar su clasificación (BOTA, ACCESORIOS u OTRO)",
      });
    }
  });

export const separarValeSchema = z.object({
  entregarTambien: z.boolean().optional().default(false),
});

export const entregarValeSchema = z.object({});

export const descontarValeSchema = z.object({});

export const retrocederValeSchema = z.object({
  estadoDestino: z.enum(["PENDIENTE", "SEPARADO", "ENTREGADO"]).optional(),
  motivo: z
    .string()
    .trim()
    .min(5, "Debe especificar un motivo válido de al menos 5 caracteres")
    .max(500, "El motivo no debe exceder 500 caracteres"),
});

export const cancelarValeSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(5, "Debe especificar un motivo de cancelación de al menos 5 caracteres")
    .max(500, "El motivo no debe exceder 500 caracteres"),
});

export const batchOperarValesSchema = z.object({
  valeIds: z
    .array(z.coerce.number().int().positive("ID de vale inválido"))
    .min(1, "Debe seleccionar al menos un vale para operar en lote")
    .max(200, "No se pueden procesar más de 200 vales en un solo lote"),
  accion: z.enum(["SEPARAR", "ENTREGAR", "SEPARAR_Y_ENTREGAR", "DESCONTAR"]),
});

export const filterValesSchema = z.object({
  departamentoId: z.coerce.number().int().positive().optional(),
  serieId: z.coerce.number().int().positive().optional(),
  departamentoValeId: z.coerce.number().int().positive().optional(),
  area: areaValeEnum.optional(),
  estado: z
    .string()
    .trim()
    .transform((val) =>
      val
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    )
    .optional(),
  excludeEstado: z.enum(["PENDIENTE", "SEPARADO", "ENTREGADO", "DESCONTADO", "CANCELADO"]).optional(),
  fechaDesde: z
    .string()
    .refine((val) => !Number.isNaN(Date.parse(val)), { message: "fechaDesde inválida" })
    .optional(),
  fechaHasta: z
    .string()
    .refine((val) => !Number.isNaN(Date.parse(val)), { message: "fechaHasta inválida" })
    .optional(),
  busqueda: z.string().trim().optional(),
  scopeView: z
    .enum(["general", "registrar", "almacen", "descontar", "auditoria"])
    .optional()
    .default("general"),
  pagina: z.coerce.number().int().positive().optional().default(1),
  limite: z.coerce.number().int().positive().max(500).optional().default(100),
});

export const valeIdParamSchema = z.object({
  id: z.coerce.number().int().positive("El ID del vale debe ser un número entero positivo"),
});

export type CreateValeInput = z.infer<typeof createValeSchema>;
export type UpdateValeInput = z.infer<typeof updateValeSchema>;
export type SepararValeInput = z.infer<typeof separarValeSchema>;
export type EntregarValeInput = z.infer<typeof entregarValeSchema>;
export type DescontarValeInput = z.infer<typeof descontarValeSchema>;
export type RetrocederValeInput = z.infer<typeof retrocederValeSchema>;
export type CancelarValeInput = z.infer<typeof cancelarValeSchema>;
export type BatchOperarValesInput = z.infer<typeof batchOperarValesSchema>;
export type FilterValesQuery = z.infer<typeof filterValesSchema>;
