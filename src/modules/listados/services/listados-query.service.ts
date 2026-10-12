import { prisma } from "../../../config/database";
import { Prisma } from "@prisma/client";
import { scopeService } from "../../auth/services/scope.service";
import { NotFoundError, ForbiddenError } from "../../../utils/errors";
import type { ListListadosQuery } from "../listados.schema";

export class ListadosQueryService {
  /**
   * Consulta paginada y filtrada incorporando directamente el alcance bidimensional (departamento + línea).
   * Respeta activos en departamento y línea tanto en conteo como en registros devueltos.
   */
  async getListados(usuarioId: number, filtros: Partial<ListListadosQuery> = {}) {
    const scope = await scopeService.resolveUserScope(usuarioId);

    // Validación de alcance departamental si se provee departamentoId explícito
    if (filtros.departamentoId !== undefined) {
      if (!scope.esGlobal && filtros.departamentoId !== scope.departamentoId) {
        throw new ForbiddenError("No tiene autorización para consultar listados de otro departamento");
      }
    }

    const scopeWhere = scopeService.buildScopeWhere(scope, filtros.lineaProduccionId);

    const where: Prisma.ListadoMaterialWhereInput = {
      ...scopeWhere,
      departamento: { estado: "ACTIVO" },
      lineaProduccion: { estado: "ACTIVO" },
      ...(scope.esGlobal && filtros.departamentoId ? { departamentoId: filtros.departamentoId } : {}),
      ...(filtros.estado && {
        estado: (() => {
          if (Array.isArray(filtros.estado)) {
            return { in: filtros.estado as Prisma.EnumEstadoListadoFilter['in'] };
          }
          if (typeof filtros.estado === 'string' && filtros.estado.includes(',')) {
            const list = filtros.estado.split(',').map((s) => s.trim()) as Prisma.EnumEstadoListadoFilter['in'];
            return { in: list };
          }
          return filtros.estado as Prisma.EnumEstadoListadoFilter['equals'];
        })(),
      }),
      ...(filtros.numeroListado && {
        numeroListado: { contains: filtros.numeroListado },
      }),
      ...((filtros.fechaDesde || filtros.fechaHasta) && {
        fechaRequerida: {
          ...(filtros.fechaDesde && { gte: new Date(filtros.fechaDesde) }),
          ...(filtros.fechaHasta && { lte: new Date(filtros.fechaHasta) }),
        },
      }),
    };

    if (!scope.esGlobal) {
      if (scope.tipoSurtidoAlmacen) {
        const permitidos = scope.tipoSurtidoAlmacen
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s === "DIRECTOS" || s === "INDIRECTOS" || s === "BOLSAS") as ("DIRECTOS" | "INDIRECTOS" | "BOLSAS")[];
        if (!scope.tipoSurtidoAlmacen.includes("TODOS") && permitidos.length > 0) {
          const isConsultandoPendientes = filtros.estado && (
            (typeof filtros.estado === 'string' && (filtros.estado.includes('PENDIENTE') || filtros.estado.includes('EN_PROCESO'))) ||
            (Array.isArray(filtros.estado) && filtros.estado.some((e) => e === 'PENDIENTE' || e === 'EN_PROCESO'))
          );

          if (isConsultandoPendientes) {
            where.frentes = {
              some: {
                tipoFrente: { in: permitidos },
                estado: { in: ["PENDIENTE", "SEPARADO"] },
              },
            };
          } else {
            where.frentes = {
              some: { tipoFrente: { in: permitidos } }
            };
          }
        }
      } else if (scope.tipoMaterialAuditor && !scope.tipoMaterialAuditor.toUpperCase().includes("TODOS")) {
        const frentesAud = scope.tipoMaterialAuditor
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s === "DIRECTOS" || s === "INDIRECTOS" || s === "BOLSAS") as ("DIRECTOS" | "INDIRECTOS" | "BOLSAS")[];
        where.frentes = {
          some: { tipoFrente: { in: frentesAud } },
        };
      } else if (scope.rolCodigo === "REGISTRADOR") {
        // Regla de Negocio REGISTRADOR:
        // Solo ve los listados registrados por él que estén en PENDIENTE y que NO tengan ningún avance
        // (es decir, ningún frente separado, entregado ni descontado). En cuanto Almacén interactúe, desaparecen.
        where.creadoPorUsuarioId = usuarioId;
        where.estado = "PENDIENTE";
        where.frentes = {
          none: {
            estado: { in: ["SEPARADO", "ENTREGADO", "DESCONTADO"] },
          },
        };
      }
    }

    const page = filtros.page ?? filtros.pagina ?? 1;
    const limit = filtros.limit ?? filtros.porPagina ?? 60;
    const skip = (page - 1) * limit;

    const [total, listados] = await prisma.$transaction([
      prisma.listadoMaterial.count({ where }),
      prisma.listadoMaterial.findMany({
        where,
        include: {
          lineaProduccion: { select: { id: true, codigo: true, nombre: true, area: true, orden: true } },
          departamento: { select: { id: true, codigo: true, nombre: true } },
          creadoPorUsuario: { select: { id: true, usuario: true, nombre: true } },
          frentes: {
            select: {
              id: true,
              tipoFrente: true,
              estado: true,
            },
          },
        },
        orderBy: [{ fechaRequerida: "asc" }, { id: "asc" }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const pagination = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };

    return {
      items: listados,
      data: listados, // compatibilidad con clientes existentes
      pagination,
      meta: {
        pagina: page,
        porPagina: limit,
        totalPaginas: totalPages,
        ...pagination,
      },
    };
  }

  /**
   * Obtiene un listado por ID garantizando que pertenezca al alcance autorizado en la consulta misma.
   */
  async getListadoById(id: number, usuarioId: number) {
    const scope = await scopeService.resolveUserScope(usuarioId);
    const scopeWhere = scopeService.buildScopeWhere(scope);

    const listado = await prisma.listadoMaterial.findFirst({
      where: {
        id,
        ...scopeWhere,
        departamento: { estado: "ACTIVO" },
        lineaProduccion: { estado: "ACTIVO" },
      },
      include: {
        lineaProduccion: { select: { id: true, codigo: true, nombre: true, area: true, orden: true, estado: true } },
        departamento: { select: { id: true, codigo: true, nombre: true, estado: true } },
        creadoPorUsuario: { select: { id: true, usuario: true, nombre: true } },
        frentes: true,
        historialEstados: {
          include: {
            cambiadoPorUsuario: { select: { id: true, usuario: true, nombre: true } },
          },
          orderBy: { fechaCambio: "asc" },
        },
      },
    });

    if (!listado) {
      throw new NotFoundError(`Listado con ID ${id} no encontrado o fuera de su alcance autorizado`);
    }

    return listado;
  }

  /**
   * Obtiene la lista ordenada descendente de años reales que tienen registros
   * de listados de material en la base de datos dentro del alcance autorizado del usuario.
   */
  async getAniosDisponibles(usuarioId: number): Promise<number[]> {
    const scope = await scopeService.resolveUserScope(usuarioId);
    const scopeWhere = scopeService.buildScopeWhere(scope);

    const listados = await prisma.listadoMaterial.findMany({
      where: {
        ...scopeWhere,
        departamento: { estado: "ACTIVO" },
        lineaProduccion: { estado: "ACTIVO" },
      },
      select: {
        fechaRequerida: true,
      },
    });

    const aniosSet = new Set<number>();
    for (const item of listados) {
      if (item.fechaRequerida) {
        aniosSet.add(new Date(item.fechaRequerida).getFullYear());
      }
    }

    const anios = Array.from(aniosSet).sort((a, b) => b - a);

    // Si aún no hubiese registros, retornar el año en curso como mínimo por defecto
    if (anios.length === 0) {
      anios.push(new Date().getFullYear());
    }

    return anios;
  }
}

export const listadosQueryService = new ListadosQueryService();
