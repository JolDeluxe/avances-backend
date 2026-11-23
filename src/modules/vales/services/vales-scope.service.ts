import type { AreaVale, Prisma } from "@prisma/client";
import { scopeService, type UserScope } from "../../auth/services/scope.service";
import { ForbiddenError } from "../../../utils/errors";
import type { ValeEventoPayload } from "../events/vales-events.types";

export type ValeScopeView = "general" | "registrar" | "almacen" | "descontar" | "auditoria";

export class ValesScopeService {
  async resolveScope(usuarioId: number): Promise<UserScope> {
    return scopeService.resolveUserScope(usuarioId);
  }

  /**
   * Determina si el usuario está sujeto al alcance operativo acumulativo de almacén
   * (áreas completas + departamentos operativos individuales) con política deny-by-default.
   * No depende únicamente del nombre del rol: aplica si el usuario tiene segmentación de almacén,
   * rol ALMACENISTA o autorizaciones explícitas de vales configuradas.
   */
  requiresCumulativeValeScope(scope: UserScope): boolean {
    if (scope.esGlobal) {
      return false;
    }

    return (
      scope.rolCodigo === "ALMACENISTA" ||
      Boolean(scope.tipoSurtidoAlmacen) ||
      scope.areasVale.length > 0 ||
      scope.departamentosValeIds.length > 0
    );
  }

  /**
   * Evalúa si el usuario tiene alcance operativo para consultar o actuar sobre un vale específico.
   * - Evalúa siempre ValeMaterial.area y ValeMaterial.departamentoValeId (persistidos en el vale).
   * - Modelo acumulativo (unión): area IN areasVale OR departamentoValeId IN departamentosValeIds.
   * - Deny-by-default si el usuario requiere alcance acumulativo y no tiene ninguna autorización configurada.
   */
  canOperateVale(
    scope: UserScope,
    vale: {
      departamentoId: number;
      area: AreaVale;
      departamentoValeId: number;
    },
  ): boolean {
    if (scope.esGlobal) {
      return true;
    }

    if (scope.departamentoId !== vale.departamentoId) {
      return false;
    }

    if (this.requiresCumulativeValeScope(scope)) {
      const porArea = scope.areasVale.includes(vale.area);
      const porDepto = scope.departamentosValeIds.includes(vale.departamentoValeId);
      return porArea || porDepto;
    }

    return true;
  }

  assertCanOperateVale(
    scope: UserScope,
    vale: {
      departamentoId: number;
      area: AreaVale;
      departamentoValeId: number;
      folio?: string;
      departamentoValeNombre?: string;
    },
  ): void {
    if (!scope.esGlobal && scope.departamentoId !== vale.departamentoId) {
      throw new ForbiddenError(
        "No tiene autorización para operar sobre vales de otro departamento organizacional",
      );
    }

    if (!this.canOperateVale(scope, vale)) {
      const etiquetaDepto = vale.departamentoValeNombre ?? `ID ${vale.departamentoValeId}`;
      const etiquetaVale = vale.folio ? ` (${vale.folio})` : "";
      throw new ForbiddenError(
        `No tiene autorización operativa para acceder o procesar vales${etiquetaVale} del departamento "${etiquetaDepto}" [Área: ${vale.area}]`,
      );
    }
  }

  /**
   * Construye el predicado Prisma de alcance para consultas y contadores de Vales.
   * - Aísla siempre por departamentoId organizacional (salvo SUPER_ADMIN).
   * - Aplica SIEMPRE el filtro acumulativo (areasVale U departamentosValeIds) para usuarios
   *   con alcance operativo acotado, sin importar qué valor se envíe en scopeView.
   * - scopeView solo puede restringir la vista, nunca ampliar el alcance del usuario.
   */
  buildQueryWhere(
    scope: UserScope,
    options: {
      departamentoIdFiltro?: number;
      scopeView?: ValeScopeView;
    } = {},
  ): Prisma.ValeMaterialWhereInput {
    if (
      options.scopeView === "almacen" &&
      !scope.esGlobal &&
      scope.rolCodigo !== "ALMACENISTA" &&
      scope.rolCodigo !== "VISUALIZADOR"
    ) {
      throw new ForbiddenError(
        "No tiene autorización para consultar el tablero operativo de almacén",
      );
    }

    const where: Prisma.ValeMaterialWhereInput = {};

    if (scope.esGlobal) {
      if (options.departamentoIdFiltro) {
        where.departamentoId = options.departamentoIdFiltro;
      }
      return where;
    }

    if (
      options.departamentoIdFiltro &&
      options.departamentoIdFiltro !== scope.departamentoId
    ) {
      throw new ForbiddenError(
        "No tiene autorización para consultar vales de otro departamento organizacional",
      );
    }

    where.departamentoId = scope.departamentoId;

    // El alcance operativo acumulativo se aplica SIEMPRE en backend sin confiar en scopeView
    if (this.requiresCumulativeValeScope(scope)) {
      const tieneAreas = scope.areasVale.length > 0;
      const tieneDeptos = scope.departamentosValeIds.length > 0;

      if (tieneAreas || tieneDeptos) {
        const condicionesAcumulativas: Prisma.ValeMaterialWhereInput[] = [];
        if (tieneAreas) {
          condicionesAcumulativas.push({ area: { in: scope.areasVale } });
        }
        if (tieneDeptos) {
          condicionesAcumulativas.push({
            departamentoValeId: { in: scope.departamentosValeIds },
          });
        }

        where.OR = condicionesAcumulativas;
      }
    }

    return where;
  }

  /**
   * Filtra un evento SSE según el alcance organizacional y operativo actual del suscriptor.
   * - Devuelve null si el suscriptor no tiene autorización para recibir el evento.
   * - En eventos por lote (VALES_LOTE_OPERADO), recorta la lista de vales/áreas/departamentos
   *   únicamente a los autorizados para el suscriptor y omite el campo interno loteItems.
   */
  filterEventForScope(
    scope: UserScope,
    evento: ValeEventoPayload,
  ): ValeEventoPayload | null {
    if (!scope.esGlobal && evento.departamentoId !== scope.departamentoId) {
      return null;
    }

    if (!this.requiresCumulativeValeScope(scope)) {
      if (evento.loteItems) {
        const { loteItems: _omit, ...cleanEvent } = evento;
        return cleanEvent;
      }
      return evento;
    }

    // Si tiene áreas o departamentos asignados, filtrar por ellos; si no tiene asignación específica,
    // se entrega el evento departamental en modo consulta (sin loteItems)
    if (scope.areasVale.length === 0 && scope.departamentosValeIds.length === 0) {
      if (evento.loteItems) {
        const { loteItems: _omit, ...cleanEvent } = evento;
        return cleanEvent;
      }
      return evento;
    }

    if (evento.tipo === "VALES_LOTE_OPERADO") {
      if (evento.loteItems && evento.loteItems.length > 0) {
        const itemsAutorizados = evento.loteItems.filter((item) =>
          this.canOperateVale(scope, {
            departamentoId: evento.departamentoId,
            area: item.area,
            departamentoValeId: item.departamentoValeId,
          }),
        );

        if (itemsAutorizados.length === 0) {
          return null;
        }

        const { loteItems: _omit, ...rest } = evento;
        return {
          ...rest,
          valeIds: itemsAutorizados.map((i) => i.id),
          areas: Array.from(new Set(itemsAutorizados.map((i) => i.area))),
          departamentoValeIds: Array.from(
            new Set(itemsAutorizados.map((i) => i.departamentoValeId)),
          ),
        };
      }

      const coincideArea = Boolean(
        evento.areas?.some((a) => scope.areasVale.includes(a)),
      );
      const coincideDepto = Boolean(
        evento.departamentoValeIds?.some((d) => scope.departamentosValeIds.includes(d)),
      );
      if (!coincideArea && !coincideDepto) {
        return null;
      }
      return evento;
    }

    if (!evento.area || !evento.departamentoValeId) {
      return null;
    }

    const permitido = this.canOperateVale(scope, {
      departamentoId: evento.departamentoId,
      area: evento.area,
      departamentoValeId: evento.departamentoValeId,
    });

    return permitido ? evento : null;
  }
}

export const valesScopeService = new ValesScopeService();
