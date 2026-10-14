import { z } from "zod";

// ─── Parámetros de ruta ───────────────────────────────────────────────────────

export const listadoIdParamSchema = z.object({
  id: z.coerce.number().int().positive("El ID del listado debe ser un número entero positivo"),
});

// ─── Crear listado ────────────────────────────────────────────────────────────

export const createListadoSchema = z.object({
  numeroListado: z
    .string()
    .min(1, "El número de listado es requerido")
    .max(50, "El número de listado no debe exceder 50 caracteres")
    .trim(),
  fechaRequerida: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha requerida debe tener formato YYYY-MM-DD"),
  lineaProduccionId: z
    .number()
    .int()
    .positive("El ID de la línea de producción debe ser un número positivo"),
});

// ─── Actualizar listado (exclusivo PENDIENTE) ─────────────────────────────────

export const updateListadoSchema = z
  .object({
    numeroListado: z
      .string()
      .trim()
      .min(1, "El número de listado no puede estar vacío")
      .max(50, "El número de listado no debe exceder 50 caracteres")
      .optional(),
    fechaRequerida: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha requerida debe tener formato YYYY-MM-DD")
      .optional(),
    lineaProduccionId: z
      .number()
      .int()
      .positive("El ID de la línea de producción debe ser un número positivo")
      .optional(),
    estado: z.any().optional(),
    departamentoId: z.any().optional(),
  })
  .refine((data) => !("estado" in data && data.estado !== undefined), {
    message: "El campo 'estado' no se puede modificar mediante PATCH",
    path: ["estado"],
  })
  .refine((data) => !("departamentoId" in data && data.departamentoId !== undefined), {
    message: "El campo 'departamentoId' no se puede modificar directamente",
    path: ["departamentoId"],
  })
  .refine(
    (data) =>
      data.numeroListado !== undefined ||
      data.fechaRequerida !== undefined ||
      data.lineaProduccionId !== undefined,
    {
      message:
        "Debe proporcionar al menos un campo válido para actualizar (numeroListado, fechaRequerida, lineaProduccionId)",
    },
  );

// ─── Motivo de Transición (Obligatorio para retrocesos y cancelaciones) ───────

export const motivoTransicionSchema = z.object({
  tipoFrente: z.enum(["DIRECTOS", "INDIRECTOS", "BOLSAS"]).optional(),
  motivo: z
    .string({ required_error: "El motivo es requerido" })
    .trim()
    .min(1, "El motivo no puede estar vacío")
    .max(500, "El motivo no debe exceder 500 caracteres"),
});

// ─── Motivo Opcional (para descontar, separar, entregar) ──────────────────────

export const motivoOpcionalSchema = z.object({
  tipoFrente: z.enum(["DIRECTOS", "INDIRECTOS", "BOLSAS"]).optional(),
  motivo: z
    .string()
    .trim()
    .max(500, "El motivo no debe exceder 500 caracteres")
    .optional(),
});

// ─── Filtros de consulta ──────────────────────────────────────────────────────

export const listListadosQuerySchema = z
  .object({
    estado: z
      .union([
        z.enum(["PENDIENTE", "EN_PROCESO", "SEPARADO", "ENTREGADO_A_PRODUCCION", "CANCELADO", "DESCONTADO"]),
        z.string().transform((val) => val.split(",").map((s) => s.trim()))
          .pipe(z.array(z.enum(["PENDIENTE", "EN_PROCESO", "SEPARADO", "ENTREGADO_A_PRODUCCION", "CANCELADO", "DESCONTADO"]))),
        z.array(z.enum(["PENDIENTE", "EN_PROCESO", "SEPARADO", "ENTREGADO_A_PRODUCCION", "CANCELADO", "DESCONTADO"])),
      ])
      .optional(),
    lineaProduccionId: z.coerce.number().int().positive("lineaProduccionId debe ser un número entero positivo").optional(),
    departamentoId: z.coerce.number().int().positive("departamentoId debe ser un número entero positivo").optional(),
    numeroListado: z.string().trim().min(1, "numeroListado no puede estar vacío").optional(),
    fechaDesde: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "fechaDesde debe tener formato YYYY-MM-DD")
      .optional(),
    fechaHasta: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "fechaHasta debe tener formato YYYY-MM-DD")
      .optional(),
    page: z.coerce.number().int().positive("page debe ser un número positivo").default(1),
    limit: z.coerce.number().int().min(1, "limit mínimo es 1").max(1000, "limit máximo es 1000").default(60),
    pagina: z.coerce.number().int().positive("pagina debe ser un número positivo").optional(),
    porPagina: z.coerce.number().int().min(1, "porPagina mínimo es 1").max(1000, "porPagina máximo es 1000").optional(),
    modoGlobal: z.coerce.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.fechaDesde && data.fechaHasta) {
        return data.fechaDesde <= data.fechaHasta;
      }
      return true;
    },
    {
      message: "fechaDesde no puede ser posterior a fechaHasta",
      path: ["fechaDesde"],
    },
  )
  .transform((data) => ({
    ...data,
    page: data.pagina ?? data.page,
    limit: data.porPagina ?? data.limit,
  }));

// ─── Operaciones en Lote (Batch) ─────────────────────────────────────────────

export const batchOperarSchema = z.object({
  ids: z
    .array(z.number().int().positive("Los IDs deben ser números enteros positivos"))
    .min(1, "Debe seleccionar al menos un listado")
    .max(100, "No puede procesar más de 100 listados por lote"),
  accion: z.enum(["separar", "entregar", "descontar"]),
  tipoFrente: z.enum(["DIRECTOS", "INDIRECTOS", "BOLSAS"]).optional(),
  motivo: z
    .string()
    .trim()
    .max(500, "El motivo no debe exceder 500 caracteres")
    .optional(),
});

// ─── Tipos inferidos ─────────────────────────────────────────────────────────

export type CreateListadoInput = z.infer<typeof createListadoSchema>;
export type UpdateListadoInput = z.infer<typeof updateListadoSchema>;
export type MotivoTransicionInput = z.infer<typeof motivoTransicionSchema>;
export type MotivoOpcionalInput = z.infer<typeof motivoOpcionalSchema>;
export type BatchOperarInput = z.infer<typeof batchOperarSchema>;
export type ListListadosInput = z.input<typeof listListadosQuerySchema>;
export type ListListadosQuery = z.infer<typeof listListadosQuerySchema>;
