import type { AreaVale, EstadoFrenteMaterial, TipoFrenteMaterial } from "@prisma/client";
import { prisma } from "../../../config/database";
import { ForbiddenError } from "../../../utils/errors";

export interface UserScope {
  usuarioId: number;
  departamentoId: number;
  lineaProduccionIds: number[];
  areasVale: AreaVale[];
  departamentosValeIds: number[];
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
        autorizacionesValeArea: {
          where: { estado: "ACTIVO" },
          select: { area: true },
        },
        autorizacionesValeDepartamento: {
          where: {
            estado: "ACTIVO",
            departamentoVale: { estado: "ACTIVO" },
          },
          select: { departamentoValeId: true },
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
        areasVale: [],
        departamentosValeIds: [],
        esGlobal: true,
        rolCodigo: usuario.rol.codigo,
        tipoSurtidoAlmacen: usuario.tipoSurtidoAlmacen,
        tipoMaterialAuditor: usuario.tipoMaterialAuditor,
      };
    }

    const lineaProduccionIds = usuario.lineasAsignadas.map((l) => l.lineaProduccionId);
    const areasVale = usuario.autorizacionesValeArea.map((a) => a.area);
    const departamentosValeIds = usuario.autorizacionesValeDepartamento.map((d) => d.departamentoValeId);

    return {
      usuarioId: usuario.id,
      departamentoId: usuario.departamentoId,
      lineaProduccionIds,
      areasVale,
      departamentosValeIds,
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

  /**
   * Determina si el alcance corresponde a un rol de supervisión operativa departamental (ADMIN),
   * el cual opera por defecto todos los tipos de frente (DIRECTOS, INDIRECTOS, BOLSAS)
   * exclusivamente dentro de su departamento asignado, sin requerir segmentación física de piso.
   * Los roles segmentados (AUDITOR, ALMACENISTA) jamás califican aquí y mantienen deny-by-default.
   */
  hasDepartmentalOperationalScope(scope: UserScope): boolean {
    return !scope.esGlobal && scope.rolCodigo === "ADMIN";
  }

  /**
   * Resuelve los frentes de auditoría autorizados para el usuario:
   * - "TODOS": SUPER_ADMIN, ADMIN departamental (sin restricción específica) o AUDITOR con "TODOS".
   * - TipoFrenteMaterial[]: Frentes específicos asignados en tipoMaterialAuditor.
   * - null: Sin alcance de auditoría (Deny-by-default para AUDITOR con campo null/vacío u otros roles).
   */
  getAuthorizedAuditFrentes(scope: UserScope): TipoFrenteMaterial[] | "TODOS" | null {
    if (scope.esGlobal) {
      return "TODOS";
    }

    const rawAuditor = scope.tipoMaterialAuditor?.trim();
    if (rawAuditor) {
      const permitidos = rawAuditor
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      if (permitidos.includes("TODOS")) {
        return "TODOS";
      }

      const validos = permitidos.filter(
        (s): s is TipoFrenteMaterial => s === "DIRECTOS" || s === "INDIRECTOS" || s === "BOLSAS",
      );
      return validos.length > 0 ? validos : null;
    }

    if (this.hasDepartmentalOperationalScope(scope)) {
      return "TODOS";
    }

    return null;
  }

  /**
   * Valida estrictamente el alcance operativo sobre un frente específico de un listado:
   * 1. SUPER_ADMIN (esGlobal): acceso global.
   * 2. Roles segmentados (ALMACENISTA / AUDITOR): requieren asignación explícita no vacía en
   *    tipoSurtidoAlmacen o tipoMaterialAuditor según la operación. Un valor null o vacío se deniega (Deny-by-default).
   * 3. ADMIN (hasDepartmentalOperationalScope): alcance departamental sobre DIRECTOS, INDIRECTOS y BOLSAS
   *    dentro de su propio departamento (el aislamiento departamental se valida previamente con scopeWhere).
   */
  assertCanOperateFrente(
    scope: UserScope,
    tipoFrente: TipoFrenteMaterial,
    operacion: "ALMACEN" | "AUDITORIA" | "RETROCESO",
    estadoOrigen?: EstadoFrenteMaterial,
  ): void {
    if (scope.esGlobal) {
      return;
    }

    const esAdminDepartamental = this.hasDepartmentalOperationalScope(scope);

    if (operacion === "ALMACEN") {
      const rawAlmacen = scope.tipoSurtidoAlmacen?.trim();
      if (rawAlmacen) {
        const permitidos = rawAlmacen
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        if (!permitidos.includes("TODOS") && !permitidos.includes(tipoFrente)) {
          throw new ForbiddenError(
            `Su alcance de almacén no le autoriza operar el frente ${tipoFrente}. Frentes autorizados: ${permitidos.join(", ")}`,
          );
        }
        return;
      }

      if (esAdminDepartamental) {
        return;
      }

      throw new ForbiddenError(
        `No cuenta con alcance operativo de surtido de almacén para operar el frente ${tipoFrente}`,
      );
    }

    if (operacion === "AUDITORIA") {
      const rawAuditor = scope.tipoMaterialAuditor?.trim();
      if (rawAuditor) {
        const permitidosAud = rawAuditor
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        if (!permitidosAud.includes("TODOS") && !permitidosAud.includes(tipoFrente)) {
          throw new ForbiddenError(
            `Su alcance de auditoría no le autoriza descontar el frente ${tipoFrente}. Frentes autorizados: ${permitidosAud.join(", ")}`,
          );
        }
        return;
      }

      if (esAdminDepartamental) {
        return;
      }

      throw new ForbiddenError(
        `No cuenta con alcance operativo de auditoría para descontar el frente ${tipoFrente}`,
      );
    }

    if (operacion === "RETROCESO") {
      const frentesAlm = scope.tipoSurtidoAlmacen
        ? scope.tipoSurtidoAlmacen.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
        : [];
      const frentesAud = scope.tipoMaterialAuditor
        ? scope.tipoMaterialAuditor.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
        : [];

      if (frentesAlm.length === 0 && frentesAud.length === 0) {
        if (esAdminDepartamental) {
          return;
        }
        throw new ForbiddenError(
          `No cuenta con alcance operativo asignado para retroceder el frente ${tipoFrente}`,
        );
      }

      if (estadoOrigen === "SEPARADO") {
        const autorizadoAlm =
          esAdminDepartamental || frentesAlm.includes("TODOS") || frentesAlm.includes(tipoFrente);
        if (!autorizadoAlm) {
          throw new ForbiddenError(
            `Su alcance de auditoría no le autoriza retroceder un material en preparación de almacén (SEPARADO). Se requiere alcance de surtido de almacén para el frente ${tipoFrente}`,
          );
        }
        return;
      }

      const autorizadoAlm =
        esAdminDepartamental || frentesAlm.includes("TODOS") || frentesAlm.includes(tipoFrente);
      const autorizadoAud =
        esAdminDepartamental || frentesAud.includes("TODOS") || frentesAud.includes(tipoFrente);

      if (!autorizadoAlm && !autorizadoAud) {
        throw new ForbiddenError(
          `Su alcance operativo no le autoriza retroceder el frente ${tipoFrente}`,
        );
      }
      return;
    }
  }
}

export const scopeService = new ScopeService();
