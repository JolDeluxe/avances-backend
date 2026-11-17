import type { AreaVale, Prisma } from "@prisma/client";
import { prisma } from "../../../config/database";
import { BadRequestError, ForbiddenError } from "../../../utils/errors";
import { normalizeCatalogCode } from "../vales.schema";
import { valesScopeService } from "./vales-scope.service";

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

export class ValesCatalogService {
  /**
   * Obtiene los catálogos activos (series y departamentos operativos) para el departamento organizacional del usuario.
   */
  async getCatalogos(actorId: number, departamentoIdQuery?: number) {
    const scope = await valesScopeService.resolveScope(actorId);

    let targetDepartamentoId = scope.departamentoId;
    if (departamentoIdQuery) {
      if (!scope.esGlobal && departamentoIdQuery !== scope.departamentoId) {
        throw new ForbiddenError(
          "No tiene autorización para consultar catálogos de otro departamento organizacional",
        );
      }
      targetDepartamentoId = departamentoIdQuery;
    } else if (scope.esGlobal) {
      const deptoMP = await prisma.departamento.findUnique({
        where: { codigo: "MATERIA_PRIMA" },
        select: { id: true },
      });
      if (deptoMP) {
        targetDepartamentoId = deptoMP.id;
      }
    }

    const [series, departamentosVale] = await Promise.all([
      prisma.serieVale.findMany({
        where: {
          departamentoId: targetDepartamentoId,
          estado: "ACTIVO",
        },
        select: {
          id: true,
          codigo: true,
          esSistema: true,
          departamentoId: true,
        },
        orderBy: [{ esSistema: "desc" }, { codigo: "asc" }],
      }),
      prisma.departamentoVale.findMany({
        where: {
          departamentoId: targetDepartamentoId,
          estado: "ACTIVO",
        },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          areaFija: true,
          requiereSeleccionArea: true,
          esSistema: true,
          departamentoId: true,
        },
        orderBy: [{ nombre: "asc" }],
      }),
    ]);

    return {
      departamentoId: targetDepartamentoId,
      series,
      departamentosVale,
      areas: ["BOTA", "ACCESORIOS", "OTRO"] as AreaVale[],
    };
  }

  /**
   * Resuelve una serie existente o crea de forma segura (con control de concurrencia P2002) una serie nueva.
   * - Si la serie existe y está ACTIVA, la reutiliza sin modificarla.
   * - Si la serie existe y está INACTIVA, rechaza la operación (no reactiva catálogos inactivos).
   */
  async resolveOrCreateSerie(
    tx: Prisma.TransactionClient,
    params: {
      departamentoId: number;
      serieId?: number;
      nuevaSerie?: string;
      actorId: number;
    },
  ) {
    if (params.nuevaSerie) {
      const codigo = normalizeCatalogCode(params.nuevaSerie);

      const existente = await tx.serieVale.findUnique({
        where: {
          unique_serie_vale_depto_codigo: {
            departamentoId: params.departamentoId,
            codigo,
          },
        },
      });

      if (existente) {
        if (existente.estado !== "ACTIVO") {
          throw new BadRequestError(
            `La serie "${codigo}" se encuentra inactiva y no puede ser utilizada ni reactivada desde el registro de vales`,
          );
        }
        return existente;
      }

      try {
        return await tx.serieVale.create({
          data: {
            departamentoId: params.departamentoId,
            codigo,
            esSistema: false,
            estado: "ACTIVO",
            creadoPorId: params.actorId,
          },
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          // Otra petición concurrente acaba de insertar la misma serie; leer fuera del snapshot
          const concurrente =
            (await prisma.serieVale.findUnique({
              where: {
                unique_serie_vale_depto_codigo: {
                  departamentoId: params.departamentoId,
                  codigo,
                },
              },
            })) ??
            (await tx.serieVale.findUnique({
              where: {
                unique_serie_vale_depto_codigo: {
                  departamentoId: params.departamentoId,
                  codigo,
                },
              },
            }));

          if (concurrente) {
            if (concurrente.estado !== "ACTIVO") {
              throw new BadRequestError(
                `La serie "${codigo}" se encuentra inactiva y no puede ser utilizada`,
              );
            }
            return concurrente;
          }
        }
        throw err;
      }
    }

    if (!params.serieId) {
      throw new BadRequestError("Debe proporcionar una serie válida");
    }

    const serie = await tx.serieVale.findFirst({
      where: {
        id: params.serieId,
        departamentoId: params.departamentoId,
        estado: "ACTIVO",
      },
    });

    if (!serie) {
      throw new BadRequestError(
        `La serie seleccionada (ID ${params.serieId}) no existe, está inactiva o no pertenece a este departamento organizacional`,
      );
    }

    return serie;
  }

  /**
   * Resuelve un departamento operativo existente o crea de forma segura (con control P2002) uno nuevo:
   * - Si existe y está ACTIVO, lo reutiliza sin modificar su configuración (respetando B7 o su areaFija).
   * - Si existe y está INACTIVO, rechaza la operación (no reactiva catálogos inactivos).
   */
  async resolveOrCreateDepartamentoVale(
    tx: Prisma.TransactionClient,
    params: {
      departamentoId: number;
      departamentoValeId?: number;
      nuevoDepartamento?: string;
      areaSolicitada?: AreaVale;
      actorId: number;
    },
  ): Promise<{
    departamentoVale: {
      id: number;
      codigo: string;
      nombre: string;
      areaFija: AreaVale | null;
      requiereSeleccionArea: boolean;
      departamentoId: number;
    };
    areaEfectiva: AreaVale;
  }> {
    if (params.nuevoDepartamento) {
      const codigo = normalizeCatalogCode(params.nuevoDepartamento);

      const evaluateExistingDepto = (depto: {
        id: number;
        codigo: string;
        nombre: string;
        areaFija: AreaVale | null;
        requiereSeleccionArea: boolean;
        estado: string;
        departamentoId: number;
      }) => {
        if (depto.estado !== "ACTIVO") {
          throw new BadRequestError(
            `El departamento operativo "${depto.nombre}" se encuentra inactivo y no puede ser utilizado ni reactivado desde el registro de vales`,
          );
        }

        if (depto.requiereSeleccionArea || !depto.areaFija) {
          if (!params.areaSolicitada) {
            throw new BadRequestError(
              `El departamento "${depto.nombre}" requiere seleccionar explícitamente el área (BOTA, ACCESORIOS u OTRO)`,
            );
          }
          return {
            departamentoVale: depto,
            areaEfectiva: params.areaSolicitada,
          };
        }

        return {
          departamentoVale: depto,
          areaEfectiva: depto.areaFija,
        };
      };

      const existente = await tx.departamentoVale.findUnique({
        where: {
          unique_depto_vale_depto_codigo: {
            departamentoId: params.departamentoId,
            codigo,
          },
        },
      });

      if (existente) {
        return evaluateExistingDepto(existente);
      }

      if (!params.areaSolicitada) {
        throw new BadRequestError(
          `Al registrar el nuevo departamento "${codigo}" debe especificar su clasificación (BOTA, ACCESORIOS u OTRO)`,
        );
      }

      try {
        const nuevoDepto = await tx.departamentoVale.create({
          data: {
            departamentoId: params.departamentoId,
            codigo,
            nombre: codigo,
            areaFija: params.areaSolicitada,
            requiereSeleccionArea: false,
            esSistema: false,
            estado: "ACTIVO",
            creadoPorId: params.actorId,
          },
        });

        return {
          departamentoVale: nuevoDepto,
          areaEfectiva: params.areaSolicitada,
        };
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          const concurrente =
            (await prisma.departamentoVale.findUnique({
              where: {
                unique_depto_vale_depto_codigo: {
                  departamentoId: params.departamentoId,
                  codigo,
                },
              },
            })) ??
            (await tx.departamentoVale.findUnique({
              where: {
                unique_depto_vale_depto_codigo: {
                  departamentoId: params.departamentoId,
                  codigo,
                },
              },
            }));

          if (concurrente) {
            return evaluateExistingDepto(concurrente);
          }
        }
        throw err;
      }
    }

    if (!params.departamentoValeId) {
      throw new BadRequestError("Debe seleccionar un departamento operativo válido");
    }

    const depto = await tx.departamentoVale.findFirst({
      where: {
        id: params.departamentoValeId,
        departamentoId: params.departamentoId,
        estado: "ACTIVO",
      },
    });

    if (!depto) {
      throw new BadRequestError(
        `El departamento operativo seleccionado (ID ${params.departamentoValeId}) no existe, está inactivo o no pertenece a este departamento organizacional`,
      );
    }

    // Regla B7: requiereSeleccionArea === true -> exige área explícita en el vale
    if (depto.requiereSeleccionArea || !depto.areaFija) {
      if (!params.areaSolicitada) {
        throw new BadRequestError(
          `El departamento "${depto.nombre}" requiere seleccionar explícitamente el área (BOTA, ACCESORIOS u OTRO) para este vale`,
        );
      }
      return {
        departamentoVale: depto,
        areaEfectiva: params.areaSolicitada,
      };
    }

    // Departamento estándar: siempre usa su areaFija del catálogo
    return {
      departamentoVale: depto,
      areaEfectiva: depto.areaFija,
    };
  }
}

export const valesCatalogService = new ValesCatalogService();
