import type { EstadoVale, Prisma } from "@prisma/client";
import { prisma } from "../../../config/database";
import { NotFoundError } from "../../../utils/errors";
import { PERMISOS } from "../../../config/permissions";
import type { FilterValesQuery } from "../vales.schema";
import { valesScopeService } from "./vales-scope.service";

const ESTADOS_VALE_VALIDOS = new Set<EstadoVale>([
  "PENDIENTE",
  "SEPARADO",
  "ENTREGADO",
  "DESCONTADO",
  "CANCELADO",
]);

export const VALE_INCLUDE_STANDARD = {
  departamento: {
    select: { id: true, codigo: true, nombre: true },
  },
  serie: {
    select: { id: true, codigo: true, esSistema: true },
  },
  departamentoVale: {
    select: {
      id: true,
      codigo: true,
      nombre: true,
      areaFija: true,
      requiereSeleccionArea: true,
    },
  },
  creadoPor: {
    select: { id: true, usuario: true, nombre: true },
  },
  separadoPor: {
    select: { id: true, usuario: true, nombre: true },
  },
  entregadoPor: {
    select: { id: true, usuario: true, nombre: true },
  },
  descontadoPor: {
    select: { id: true, usuario: true, nombre: true },
  },
  revertidoPor: {
    select: { id: true, usuario: true, nombre: true },
  },
  canceladoPor: {
    select: { id: true, usuario: true, nombre: true },
  },
} satisfies Prisma.ValeMaterialInclude;

function combineWhere(conditions: Prisma.ValeMaterialWhereInput[]): Prisma.ValeMaterialWhereInput {
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0]!;
  return { AND: conditions };
}

export class ValesQueryService {
  async getVales(filters: FilterValesQuery, actorId: number) {
    const scope = await valesScopeService.resolveScope(actorId);
    const pagina = filters.pagina ?? 1;
    const limite = filters.limite ?? 100;
    const saltar = (pagina - 1) * limite;

    const baseScopeWhere = valesScopeService.buildQueryWhere(scope, {
      departamentoIdFiltro: filters.departamentoId,
      scopeView: filters.scopeView,
    });

    const commonConditions: Prisma.ValeMaterialWhereInput[] = [baseScopeWhere];

    if (filters.serieId) {
      commonConditions.push({ serieId: filters.serieId });
    }

    if (filters.departamentoValeId) {
      commonConditions.push({ departamentoValeId: filters.departamentoValeId });
    }

    if (filters.fechaDesde || filters.fechaHasta) {
      const rangoFecha: Prisma.DateTimeFilter = {};
      if (filters.fechaDesde) {
        const rawDesde = filters.fechaDesde.trim();
        rangoFecha.gte = rawDesde.includes("T")
          ? new Date(rawDesde)
          : new Date(`${rawDesde.slice(0, 10)}T00:00:00.000Z`);
      }
      if (filters.fechaHasta) {
        const rawHasta = filters.fechaHasta.trim();
        rangoFecha.lte = rawHasta.includes("T")
          ? new Date(rawHasta)
          : new Date(`${rawHasta.slice(0, 10)}T23:59:59.999Z`);
      }
      commonConditions.push({ fechaSolicitud: rangoFecha });
    }

    if (filters.busqueda && filters.busqueda.trim() !== "") {
      const term = filters.busqueda.trim();
      commonConditions.push({
        OR: [
          { folio: { contains: term } },
          { serie: { codigo: { contains: term } } },
          { departamentoVale: { nombre: { contains: term } } },
        ],
      });
    }

    let areaCondition: Prisma.ValeMaterialWhereInput | null = null;
    if (filters.area) {
      areaCondition = { area: filters.area };
    }

    let estadoCondition: Prisma.ValeMaterialWhereInput | null = null;
    if (filters.estado) {
      const estadosArray = Array.isArray(filters.estado) ? filters.estado : [filters.estado];
      if (estadosArray.length > 0) {
        const estadosFiltrados = estadosArray.filter((e): e is EstadoVale =>
          ESTADOS_VALE_VALIDOS.has(e as EstadoVale),
        );
        if (estadosFiltrados.length === 1) {
          estadoCondition = { estado: estadosFiltrados[0] };
        } else if (estadosFiltrados.length > 1) {
          estadoCondition = { estado: { in: estadosFiltrados } };
        }
      }
    } else if (filters.excludeEstado) {
      estadoCondition = { estado: { not: filters.excludeEstado } };
    }

    // where completo para items y total
    const whereItems = combineWhere([
      ...commonConditions,
      ...(areaCondition ? [areaCondition] : []),
      ...(estadoCondition ? [estadoCondition] : []),
    ]);

    // conteosPorEstado considera todos los filtros activos EXCEPTO estado
    const whereConteosEstado = combineWhere([
      ...commonConditions,
      ...(areaCondition ? [areaCondition] : []),
    ]);

    // conteosPorArea considera todos los filtros activos EXCEPTO area
    const whereConteosArea = combineWhere([
      ...commonConditions,
      ...(estadoCondition ? [estadoCondition] : []),
    ]);

    const [total, items, conteosEstadoRaw, conteosAreaRaw] = await Promise.all([
      prisma.valeMaterial.count({ where: whereItems }),
      prisma.valeMaterial.findMany({
        where: whereItems,
        include: VALE_INCLUDE_STANDARD,
        orderBy: [
          { fechaSolicitud: "asc" },
          { id: "asc" },
        ],
        skip: saltar,
        take: limite,
      }),
      prisma.valeMaterial.groupBy({
        by: ["estado"],
        where: whereConteosEstado,
        _count: { _all: true },
      }),
      prisma.valeMaterial.groupBy({
        by: ["area"],
        where: whereConteosArea,
        _count: { _all: true },
      }),
    ]);

    const conteosPorEstado: Record<EstadoVale, number> = {
      PENDIENTE: 0,
      SEPARADO: 0,
      ENTREGADO: 0,
      DESCONTADO: 0,
      CANCELADO: 0,
    };

    for (const row of conteosEstadoRaw) {
      conteosPorEstado[row.estado] = row._count._all;
    }

    const conteosPorArea = {
      BOTA: 0,
      ACCESORIOS: 0,
      OTRO: 0,
    };

    for (const row of conteosAreaRaw) {
      conteosPorArea[row.area] = row._count._all;
    }

    return {
      total,
      pagina,
      limite,
      totalPaginas: Math.ceil(total / limite),
      conteosPorEstado,
      conteosPorArea,
      items,
    };
  }

  async getValeById(id: number, actorId: number) {
    const scope = await valesScopeService.resolveScope(actorId);

    const vale = await prisma.valeMaterial.findUnique({
      where: { id },
      include: {
        ...VALE_INCLUDE_STANDARD,
        historialEstados: {
          include: {
            usuario: {
              select: { id: true, usuario: true, nombre: true },
            },
          },
          orderBy: [{ fechaCambio: "desc" }, { id: "desc" }],
        },
      },
    });

    if (!vale) {
      throw new NotFoundError(`Vale con ID ${id} no encontrado`);
    }

    if (!scope.esGlobal && vale.departamentoId !== scope.departamentoId) {
      throw new NotFoundError(`Vale con ID ${id} no encontrado`);
    }

    return vale;
  }

  /**
   * Conteo exacto de vales en ENTREGADO elegibles para auditoría
   * según las asignaciones y permisos del usuario autenticado.
   */
  async getAuditoriaCount(usuarioId: number, permisosUsuario: string[]): Promise<number> {
    if (!permisosUsuario || !permisosUsuario.includes(PERMISOS.VALE_DESCONTAR)) {
      return 0;
    }

    const scope = await valesScopeService.resolveScope(usuarioId);

    // Deny-by-default para alcance acumulativo vacío
    if (
      valesScopeService.requiresCumulativeValeScope(scope) &&
      scope.areasVale.length === 0 &&
      scope.departamentosValeIds.length === 0
    ) {
      return 0;
    }

    const scopeWhere = valesScopeService.buildQueryWhere(scope);

    return prisma.valeMaterial.count({
      where: {
        ...scopeWhere,
        estado: "ENTREGADO",
      },
    });
  }
}

export const valesQueryService = new ValesQueryService();
