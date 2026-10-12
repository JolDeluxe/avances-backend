import { prisma } from "../../config/database";
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from "../../utils/errors";
import { scopeService } from "../auth/services/scope.service";
import type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
  CreateLineInput,
  UpdateLineInput,
} from "./departments.schema";

export class DepartmentsService {
  async getDepartments(soloActivos = true) {
    return prisma.departamento.findMany({
      where: soloActivos ? { estado: "ACTIVO" } : undefined,
      include: {
        lineasProduccion: {
          where: soloActivos ? { estado: "ACTIVO" } : undefined,
          orderBy: [{ orden: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { id: "asc" },
    });
  }

  async getDepartmentById(id: number, soloActivos = true) {
    const departamento = await prisma.departamento.findFirst({
      where: {
        id,
        ...(soloActivos && { estado: "ACTIVO" }),
      },
      include: {
        lineasProduccion: {
          where: soloActivos ? { estado: "ACTIVO" } : undefined,
          orderBy: [{ orden: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!departamento) {
      throw new NotFoundError(`Departamento con ID ${id} no encontrado`);
    }

    return departamento;
  }

  async createDepartment(data: CreateDepartmentInput, usuarioId?: number) {
    if (usuarioId) {
      const scope = await scopeService.resolveUserScope(usuarioId);
      if (!scope.esGlobal) {
        throw new ForbiddenError("Operación denegada: Solo SUPER_ADMIN puede crear o administrar departamentos globales");
      }
    }

    const existing = await prisma.departamento.findUnique({
      where: { codigo: data.codigo },
    });

    if (existing) {
      throw new ConflictError(`Ya existe un departamento con el código '${data.codigo}'`);
    }

    const departamento = await prisma.departamento.create({
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        estado: "ACTIVO",
      },
      include: {
        lineasProduccion: true,
      },
    });

    await prisma.registroAuditoria.create({
      data: {
        usuarioId: usuarioId ?? null,
        accion: "DEPARTAMENTO_CREADO",
        entidad: "departamentos",
        entidadId: departamento.id,
        detalle: `Departamento creado: ${departamento.codigo} - ${departamento.nombre}`,
      },
    });

    return departamento;
  }

  async updateDepartment(id: number, data: UpdateDepartmentInput, usuarioId?: number) {
    if (usuarioId) {
      const scope = await scopeService.resolveUserScope(usuarioId);
      if (!scope.esGlobal) {
        throw new ForbiddenError("Operación denegada: Solo SUPER_ADMIN puede crear o administrar departamentos globales");
      }
    }

    await this.getDepartmentById(id, false);

    const departamento = await prisma.departamento.update({
      where: { id },
      data: {
        ...(data.nombre && { nombre: data.nombre }),
        ...(data.estado && { estado: data.estado }),
      },
      include: {
        lineasProduccion: true,
      },
    });

    await prisma.registroAuditoria.create({
      data: {
        usuarioId: usuarioId ?? null,
        accion: "DEPARTAMENTO_MODIFICADO",
        entidad: "departamentos",
        entidadId: departamento.id,
        detalle: `Departamento actualizado: ${departamento.codigo}`,
      },
    });

    return departamento;
  }

  async deleteDepartment(id: number, usuarioId?: number) {
    if (usuarioId) {
      const scope = await scopeService.resolveUserScope(usuarioId);
      if (!scope.esGlobal) {
        throw new ForbiddenError("Operación denegada: Solo SUPER_ADMIN puede crear o administrar departamentos globales");
      }
    }

    const departamento = await this.getDepartmentById(id, false);

    // Borrado lógico
    await prisma.$transaction(async (tx) => {
      await tx.departamento.update({
        where: { id },
        data: { estado: "INACTIVO" },
      });

      await tx.lineaProduccion.updateMany({
        where: { departamentoId: id },
        data: { estado: "INACTIVO" },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: usuarioId ?? null,
          accion: "DEPARTAMENTO_INACTIVADO",
          entidad: "departamentos",
          entidadId: id,
          detalle: `Departamento inactivado lógicamente junto con sus líneas: ${departamento.codigo}`,
        },
      });
    });

    return { mensaje: `Departamento ${departamento.codigo} inactivado exitosamente` };
  }

  async createLine(departmentId: number, data: CreateLineInput, usuarioId?: number) {
    const departamento = await prisma.departamento.findUnique({
      where: { id: departmentId },
    });

    if (!departamento || departamento.estado !== "ACTIVO") {
      throw new BadRequestError(`El departamento ID ${departmentId} no existe o no está activo`);
    }

    if (usuarioId) {
      const scope = await scopeService.resolveUserScope(usuarioId);
      if (!scope.esGlobal && scope.departamentoId !== departmentId) {
        throw new ForbiddenError("No tiene autorización para administrar líneas de producción de otro departamento");
      }
    }

    const cleanNombre = data.nombre.trim().toUpperCase();
    let cleanCodigo = (
      data.codigo?.trim().toUpperCase() ||
      cleanNombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
    ).slice(0, 30);

    if (!cleanCodigo) {
      cleanCodigo = `LIN_${Date.now()}`;
    }

    const existingCode = await prisma.lineaProduccion.findUnique({
      where: { codigo: cleanCodigo },
    });

    if (existingCode) {
      if (data.codigo) {
        throw new ConflictError(`Ya existe una línea de producción con el código '${cleanCodigo}'`);
      }
      cleanCodigo = `${cleanCodigo.slice(0, 24)}_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const areaEfectiva = data.area ?? (cleanCodigo === "BOLSAS" ? "ACCESORIOS" : "BOTA");

    // Calcular siguiente orden disponible para este departamento y área
    const maxOrden = await prisma.lineaProduccion.aggregate({
      where: { departamentoId: departmentId, area: areaEfectiva },
      _max: { orden: true },
    });
    const nuevoOrden = (maxOrden._max.orden ?? 0) + 1;

    const linea = await prisma.lineaProduccion.create({
      data: {
        codigo: cleanCodigo,
        nombre: cleanNombre,
        departamentoId: departmentId,
        area: areaEfectiva,
        orden: nuevoOrden,
        estado: "ACTIVO",
      },
    });

    await prisma.registroAuditoria.create({
      data: {
        usuarioId: usuarioId ?? null,
        accion: "LINEA_PRODUCCION_CREADA",
        entidad: "lineas_produccion",
        entidadId: linea.id,
        detalle: `Línea creada en depto ${departamento.codigo}: ${linea.codigo} - ${linea.nombre} [${areaEfectiva}] con orden ${nuevoOrden}`,
      },
    });

    return linea;
  }

  async updateLine(lineId: number, data: UpdateLineInput, usuarioId?: number) {
    const lineaExistente = await prisma.lineaProduccion.findUnique({
      where: { id: lineId },
    });

    if (!lineaExistente) {
      throw new NotFoundError(`Línea de producción ID ${lineId} no encontrada`);
    }

    if (usuarioId) {
      const scope = await scopeService.resolveUserScope(usuarioId);
      if (!scope.esGlobal && scope.departamentoId !== lineaExistente.departamentoId) {
        throw new ForbiddenError("No tiene autorización para administrar líneas de producción de otro departamento");
      }
    }

    const cleanNombre = data.nombre ? data.nombre.trim().toUpperCase() : undefined;

    const linea = await prisma.lineaProduccion.update({
      where: { id: lineId },
      data: {
        ...(cleanNombre && { nombre: cleanNombre }),
        ...(data.area && { area: data.area }),
        ...(data.estado && { estado: data.estado }),
      },
    });

    await prisma.registroAuditoria.create({
      data: {
        usuarioId: usuarioId ?? null,
        accion: "LINEA_PRODUCCION_MODIFICADA",
        entidad: "lineas_produccion",
        entidadId: linea.id,
        detalle: `Línea actualizada: ${linea.codigo}`,
      },
    });

    return linea;
  }

  async deleteLine(lineId: number, usuarioId?: number) {
    const linea = await prisma.lineaProduccion.findUnique({
      where: { id: lineId },
    });

    if (!linea) {
      throw new NotFoundError(`Línea de producción ID ${lineId} no encontrada`);
    }

    if (usuarioId) {
      const scope = await scopeService.resolveUserScope(usuarioId);
      if (!scope.esGlobal && scope.departamentoId !== linea.departamentoId) {
        throw new ForbiddenError("No tiene autorización para administrar líneas de producción de otro departamento");
      }
    }

    await prisma.lineaProduccion.update({
      where: { id: lineId },
      data: { estado: "INACTIVO" },
    });

    await prisma.registroAuditoria.create({
      data: {
        usuarioId: usuarioId ?? null,
        accion: "LINEA_PRODUCCION_INACTIVADA",
        entidad: "lineas_produccion",
        entidadId: lineId,
        detalle: `Línea de producción inactivada lógicamente: ${linea.codigo}`,
      },
    });

    return { mensaje: `Línea de producción ${linea.codigo} inactivada exitosamente` };
  }

  async reorderLineas(items: Array<{ id: number; orden: number }>, usuarioId?: number) {
    if (!items || items.length === 0) {
      return { mensaje: "No hay líneas para reordenar" };
    }

    if (usuarioId) {
      const scope = await scopeService.resolveUserScope(usuarioId);
      if (!scope.esGlobal) {
        // Verificar que todas las líneas pertenezcan al departamento del usuario
        const lineas = await prisma.lineaProduccion.findMany({
          where: { id: { in: items.map((i) => i.id) } },
          select: { id: true, departamentoId: true },
        });
        const algunaAjena = lineas.some((l) => l.departamentoId !== scope.departamentoId);
        if (algunaAjena) {
          throw new ForbiddenError("No tiene autorización para reordenar líneas de producción de otro departamento");
        }
      }
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.lineaProduccion.update({
          where: { id: item.id },
          data: { orden: item.orden },
        }),
      ),
    );

    await prisma.registroAuditoria.create({
      data: {
        usuarioId: usuarioId ?? null,
        accion: "LINEAS_PRODUCCION_REORDENADAS",
        entidad: "lineas_produccion",
        entidadId: items[0]?.id ?? 0,
        detalle: `Reordenadas ${items.length} líneas de producción`,
      },
    });

    return { mensaje: "Líneas de producción reordenadas exitosamente" };
  }
}

export const departmentsService = new DepartmentsService();
