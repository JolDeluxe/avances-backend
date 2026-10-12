import { prisma } from "../../../config/database";
import { ForbiddenError } from "../../../utils/errors";

export interface UserScope {
  usuarioId: number;
  departamentoId: number;
  lineaProduccionIds: number[];
  esGlobal: boolean; // SUPER_ADMIN
  rolCodigo: string;
  tipoSurtidoAlmacen: string | null;
  tipoMaterialAuditor: string | null;
}

/**
 * Servicio encargado de resolver y validar el ALCANCE operativo de un usuario.
 * 
 * PERMISO: ¿Qué operación puede hacer? (Validado por middlewares de autorización y permisos efectivos).
 * ALCANCE: ¿Sobre qué datos/departamentos/líneas puede hacerlo? (Validado aquí).
 * 
 * Reglas de Alcance:
 * 1. SUPER_ADMIN: Alcance global total (sin restricciones departamentales ni de línea).
 * 2. Usuarios con líneas asignadas (ej. ALMACENISTA):
 *    - Restringido estrictamente a su departamentoId y a sus lineaProduccionIds activas.
 * 3. Usuarios sin líneas asignadas pero con departamento (ej. ADMIN / AUDITOR):
 *    - Restringido estrictamente a su departamentoId (todas las líneas de dicho departamento).
 */
export class ScopeService {
  /**
   * Obtiene el alcance operativo en tiempo real consultando la base de datos
   * (evitando almacenar líneas volátiles en el JWT).
   */
  async resolveUserScope(usuarioId: number): Promise<UserScope> {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        estado: true,
        departamentoId: true,
        tipoSurtidoAlmacen: true,
        tipoMaterialAuditor: true,
        rol: {
          select: {
            codigo: true,
            estado: true,
          },
        },
        lineasAsignadas: {
          where: { estado: "ACTIVO" },
          select: { lineaProduccionId: true },
        },
      },
    });

    if (!usuario || usuario.estado !== "ACTIVO") {
      throw new ForbiddenError("Usuario inactivo o no encontrado");
    }

    const esSuperAdmin = usuario.rol.codigo === "SUPER_ADMIN" && usuario.rol.estado === "ACTIVO";

    if (esSuperAdmin) {
      return {
        usuarioId: usuario.id,
        departamentoId: usuario.departamentoId,
        lineaProduccionIds: [],
        esGlobal: true,
        rolCodigo: usuario.rol.codigo,
        tipoSurtidoAlmacen: usuario.tipoSurtidoAlmacen,
        tipoMaterialAuditor: usuario.tipoMaterialAuditor,
      };
    }

    const lineaProduccionIds = usuario.lineasAsignadas.map((l) => l.lineaProduccionId);

    return {
      usuarioId: usuario.id,
      departamentoId: usuario.departamentoId,
      lineaProduccionIds,
      esGlobal: false,
      rolCodigo: usuario.rol.codigo,
      tipoSurtidoAlmacen: usuario.tipoSurtidoAlmacen,
      tipoMaterialAuditor: usuario.tipoMaterialAuditor,
    };
  }

  /**
   * Construye el filtro bidimensional { departamentoId, lineaProduccionId }
   * que garantiza que ninguna consulta escape del alcance autorizado.
   */
  buildScopeWhere(scope: UserScope, lineaIdFiltro?: number) {
    if (scope.esGlobal) {
      return lineaIdFiltro ? { lineaProduccionId: lineaIdFiltro } : {};
    }

    // Si el usuario tiene líneas asignadas específicas
    if (scope.lineaProduccionIds.length > 0) {
      if (lineaIdFiltro) {
        if (!scope.lineaProduccionIds.includes(lineaIdFiltro)) {
          throw new ForbiddenError("No tiene autorización para operar en la línea solicitada");
        }
        return {
          departamentoId: scope.departamentoId,
          lineaProduccionId: lineaIdFiltro,
        };
      }

      return {
        departamentoId: scope.departamentoId,
        lineaProduccionId: { in: scope.lineaProduccionIds },
      };
    }

    // Usuario sin líneas específicas (opera todas las líneas de su departamento)
    return {
      departamentoId: scope.departamentoId,
      ...(lineaIdFiltro ? { lineaProduccionId: lineaIdFiltro } : {}),
    };
  }

  /**
   * Valida si un destino (departamentoId + lineaProduccionId) está dentro del alcance del usuario.
   * Lanza ForbiddenError si no está autorizado.
   */
  validateDestinationScope(
    scope: UserScope,
    destino: { departamentoId: number; lineaProduccionId: number },
  ): void {
    if (scope.esGlobal) return;

    if (scope.departamentoId !== destino.departamentoId) {
      throw new ForbiddenError("No tiene autorización para operar en un departamento diferente al asignado");
    }

    if (scope.lineaProduccionIds.length > 0 && !scope.lineaProduccionIds.includes(destino.lineaProduccionId)) {
      throw new ForbiddenError("No tiene autorización para operar en la línea de producción solicitada");
    }
  }
}

export const scopeService = new ScopeService();
