import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../config/database";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../utils/errors";
import {
  normalizeCatalogCode,
  type CreateValeInput,
  type UpdateValeInput,
} from "../vales.schema";
import { valesEventPublisher } from "../events";
import { valesScopeService } from "./vales-scope.service";
import { valesCatalogService } from "./vales-catalog.service";
import { valesQueryService } from "./vales-query.service";

const DATE_PREFIX_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Resuelve la fecha y hora de solicitud siguiendo una convención nominal uniforme en UTC:
 * - Con hora (HH:mm): se almacena como `${YYYY-MM-DD}T${HH:mm}:00.000Z` y `tieneHoraSolicitud = true`.
 *   Así las horas entre 18:00 y 23:59 permanecen siempre en el mismo día documental capturado.
 * - Sin hora: se almacena como `${YYYY-MM-DD}T12:00:00.000Z` y `tieneHoraSolicitud = false`.
 */
export function resolveFechaYHoraSolicitud(
  fechaRaw: string,
  horaRaw?: string | null,
  tieneHoraExplicito?: boolean,
): { fechaSolicitud: Date; tieneHoraSolicitud: boolean } {
  const trimmedFecha = fechaRaw.trim();
  const soloFecha = trimmedFecha.slice(0, 10);

  if (!DATE_PREFIX_REGEX.test(soloFecha)) {
    throw new BadRequestError("La fecha de solicitud debe iniciar con formato YYYY-MM-DD válido");
  }

  const trimmedHora = horaRaw?.trim() || "";

  // Caso 1: Se proporcionó hora explícita HH:mm junto con la fecha
  if (trimmedHora) {
    if (!TIME_HHMM_REGEX.test(trimmedHora)) {
      throw new BadRequestError("La hora de solicitud debe tener formato HH:mm (24h)");
    }
    const combinadaUtc = new Date(`${soloFecha}T${trimmedHora}:00.000Z`);
    if (Number.isNaN(combinadaUtc.getTime())) {
      throw new BadRequestError("La combinación de fecha y hora de solicitud no es válida");
    }
    return {
      fechaSolicitud: combinadaUtc,
      tieneHoraSolicitud: true,
    };
  }

  // Caso 2: El string ISO incluye componente horario y tieneHoraExplicito === true
  if (trimmedFecha.includes("T") && tieneHoraExplicito === true && horaRaw !== null) {
    const horaExtraida = trimmedFecha.slice(11, 16);
    if (TIME_HHMM_REGEX.test(horaExtraida)) {
      const combinadaIsoUtc = new Date(`${soloFecha}T${horaExtraida}:00.000Z`);
      if (!Number.isNaN(combinadaIsoUtc.getTime())) {
        return {
          fechaSolicitud: combinadaIsoUtc,
          tieneHoraSolicitud: true,
        };
      }
    }
  }

  // Caso 3: Solo fecha (YYYY-MM-DD) sin hora -> Normalizar a 12:00:00.000Z
  const fechaMediodiaUtc = new Date(`${soloFecha}T12:00:00.000Z`);
  if (Number.isNaN(fechaMediodiaUtc.getTime())) {
    throw new BadRequestError("La fecha de solicitud no es válida");
  }

  return {
    fechaSolicitud: fechaMediodiaUtc,
    tieneHoraSolicitud: false,
  };
}

export class ValesService {
  async createVale(data: CreateValeInput, actorId: number) {
    const scope = await valesScopeService.resolveScope(actorId);

    let targetDepartamentoId = scope.departamentoId;
    if (data.departamentoId) {
      if (!scope.esGlobal && data.departamentoId !== scope.departamentoId) {
        throw new ForbiddenError(
          "No tiene autorización para registrar vales en otro departamento organizacional",
        );
      }
      targetDepartamentoId = data.departamentoId;
    } else if (scope.esGlobal) {
      const deptoMP = await prisma.departamento.findUnique({
        where: { codigo: "MATERIA_PRIMA" },
        select: { id: true },
      });
      if (deptoMP) {
        targetDepartamentoId = deptoMP.id;
      }
    }

    const folioNormalizado = normalizeCatalogCode(data.folio);
    const { fechaSolicitud, tieneHoraSolicitud } = resolveFechaYHoraSolicitud(
      data.fechaSolicitud,
      data.horaSolicitud,
      data.tieneHoraSolicitud,
    );

    // Transacción atómica de creación (incluyendo alta dinámica de serie o departamento si aplica)
    const creado = await prisma.$transaction(async (tx) => {
      const serie = await valesCatalogService.resolveOrCreateSerie(tx, {
        departamentoId: targetDepartamentoId,
        serieId: data.serieId,
        nuevaSerie: data.nuevaSerie,
        actorId,
      });

      const { departamentoVale, areaEfectiva } =
        await valesCatalogService.resolveOrCreateDepartamentoVale(tx, {
          departamentoId: targetDepartamentoId,
          departamentoValeId: data.departamentoValeId,
          nuevoDepartamento: data.nuevoDepartamento,
          areaSolicitada: data.area,
          actorId,
        });

      // Si el actor tiene alcance operativo acotado, validar que el vale pertenezca a su alcance
      valesScopeService.assertCanOperateVale(scope, {
        departamentoId: targetDepartamentoId,
        area: areaEfectiva,
        departamentoValeId: departamentoVale.id,
        folio: folioNormalizado,
        departamentoValeNombre: departamentoVale.nombre,
      });

      const vale = await tx.valeMaterial.create({
        data: {
          departamentoId: targetDepartamentoId,
          serieId: serie.id,
          departamentoValeId: departamentoVale.id,
          folio: folioNormalizado,
          area: areaEfectiva,
          fechaSolicitud,
          tieneHoraSolicitud,
          estado: "PENDIENTE",
          creadoPorId: actorId,
        },
      });

      await tx.historialEstadoVale.create({
        data: {
          valeId: vale.id,
          accion: "CREACION",
          estadoAnterior: null,
          estadoNuevo: "PENDIENTE",
          usuarioId: actorId,
        },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId,
          accion: "VALE_CREADO",
          entidad: "vales_material",
          entidadId: vale.id,
          detalle: `Vale registrado: Serie ${serie.codigo} | Folio ${folioNormalizado} | Línea: ${departamentoVale.nombre}`,
        },
      });

      return {
        vale,
        serie,
        departamentoVale,
      };
    });

    const valeCompleto = await valesQueryService.getValeById(creado.vale.id, actorId);

    // Emisión SSE estrictamente post-commit
    valesEventPublisher.publish({
      id: randomUUID(),
      tipo: "VALE_CREADO",
      valeId: valeCompleto.id,
      folio: valeCompleto.folio,
      serieId: valeCompleto.serieId,
      serieCodigo: valeCompleto.serie.codigo,
      departamentoId: valeCompleto.departamentoId,
      departamentoValeId: valeCompleto.departamentoValeId,
      departamentoValeNombre: valeCompleto.departamentoVale.nombre,
      area: valeCompleto.area,
      estadoAnterior: null,
      estadoNuevo: valeCompleto.estado,
      actorId,
      actorNombre: valeCompleto.creadoPor.nombre,
      fechaEvento: new Date().toISOString(),
    });

    return valeCompleto;
  }

  async updateVale(id: number, data: UpdateValeInput, actorId: number) {
    const scope = await valesScopeService.resolveScope(actorId);

    const valeActual = await prisma.valeMaterial.findUnique({
      where: { id },
      include: {
        serie: true,
        departamentoVale: true,
      },
    });

    if (!valeActual) {
      throw new NotFoundError(`Vale con ID ${id} no encontrado`);
    }

    if (!scope.esGlobal && valeActual.departamentoId !== scope.departamentoId) {
      throw new NotFoundError(`Vale con ID ${id} no encontrado`);
    }

    // Validar alcance operativo sobre el vale actual
    valesScopeService.assertCanOperateVale(scope, {
      departamentoId: valeActual.departamentoId,
      area: valeActual.area,
      departamentoValeId: valeActual.departamentoValeId,
      folio: valeActual.folio,
      departamentoValeNombre: valeActual.departamentoVale.nombre,
    });

    if (valeActual.estado === "CANCELADO" || valeActual.estado === "DESCONTADO") {
      throw new ConflictError(
        `No se pueden modificar los datos de un vale ${valeActual.estado === "CANCELADO" ? "cancelado" : "que ya fue descontado en el sistema"}. Para corregirlo, debe retroceder primero el descuento a PENDIENTE.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Resolver serie (nueva, cambiada o mantener la actual)
      const serieEfectiva =
        data.nuevaSerie || data.serieId
          ? await valesCatalogService.resolveOrCreateSerie(tx, {
              departamentoId: valeActual.departamentoId,
              serieId: data.serieId,
              nuevaSerie: data.nuevaSerie,
              actorId,
            })
          : valeActual.serie;

      // 2. Resolver folio
      const folioEfectivo =
        data.folio !== undefined ? normalizeCatalogCode(data.folio) : valeActual.folio;

      // 3. Resolver departamento operativo y área efectiva (respetando B7 y departamentos nuevos)
      const cambioDepto =
        Boolean(data.nuevoDepartamento) ||
        (data.departamentoValeId !== undefined &&
          data.departamentoValeId !== valeActual.departamentoValeId);

      const areaParaResolver = cambioDepto
        ? data.area
        : (data.area ??
          (valeActual.departamentoVale.requiereSeleccionArea ? valeActual.area : undefined));

      const { departamentoVale: deptoValeEfectivo, areaEfectiva } =
        await valesCatalogService.resolveOrCreateDepartamentoVale(tx, {
          departamentoId: valeActual.departamentoId,
          departamentoValeId: data.nuevoDepartamento
            ? undefined
            : (data.departamentoValeId ?? valeActual.departamentoValeId),
          nuevoDepartamento: data.nuevoDepartamento,
          areaSolicitada: areaParaResolver,
          actorId,
        });

      // Validar que el destino también esté dentro del alcance operativo del usuario
      valesScopeService.assertCanOperateVale(scope, {
        departamentoId: valeActual.departamentoId,
        area: areaEfectiva,
        departamentoValeId: deptoValeEfectivo.id,
        folio: folioEfectivo,
        departamentoValeNombre: deptoValeEfectivo.nombre,
      });

      // 4. Resolver fecha y hora de solicitud preservando la hora existente si solo se edita la fecha
      let fechaSolicitudEfectiva = valeActual.fechaSolicitud;
      let tieneHoraEfectiva = valeActual.tieneHoraSolicitud;

      if (
        data.fechaSolicitud !== undefined ||
        data.horaSolicitud !== undefined ||
        data.tieneHoraSolicitud !== undefined
      ) {
        const fechaActualIso = valeActual.fechaSolicitud.toISOString();
        const fechaDiaBase = data.fechaSolicitud
          ? data.fechaSolicitud.trim().slice(0, 10)
          : fechaActualIso.slice(0, 10);

        const horaActualExtraida = valeActual.tieneHoraSolicitud
          ? fechaActualIso.slice(11, 16)
          : null;

        const quitaHoraExplicitamente =
          data.horaSolicitud === null ||
          (data.tieneHoraSolicitud === false && !data.horaSolicitud);

        let horaParaResolver: string | null | undefined;
        let tieneHoraParaResolver: boolean | undefined;

        if (quitaHoraExplicitamente) {
          horaParaResolver = null;
          tieneHoraParaResolver = false;
        } else if (typeof data.horaSolicitud === "string" && data.horaSolicitud.trim() !== "") {
          horaParaResolver = data.horaSolicitud.trim();
          tieneHoraParaResolver = true;
        } else if (
          data.fechaSolicitud &&
          data.fechaSolicitud.includes("T") &&
          data.tieneHoraSolicitud === true
        ) {
          horaParaResolver = data.fechaSolicitud.trim().slice(11, 16);
          tieneHoraParaResolver = true;
        } else if (valeActual.tieneHoraSolicitud && horaActualExtraida) {
          horaParaResolver = horaActualExtraida;
          tieneHoraParaResolver = true;
        } else {
          horaParaResolver = null;
          tieneHoraParaResolver = false;
        }

        const resuelta = resolveFechaYHoraSolicitud(
          fechaDiaBase,
          horaParaResolver,
          tieneHoraParaResolver,
        );
        fechaSolicitudEfectiva = resuelta.fechaSolicitud;
        tieneHoraEfectiva = resuelta.tieneHoraSolicitud;
      }

      // 5. Construir registro compacto de diferencias para auditoría en HistorialEstadoVale.cambios
      const cambios: Record<string, { anterior: unknown; nuevo: unknown }> = {};

      if (serieEfectiva.id !== valeActual.serieId) {
        cambios.serie = { anterior: valeActual.serie.codigo, nuevo: serieEfectiva.codigo };
      }
      if (folioEfectivo !== valeActual.folio) {
        cambios.folio = { anterior: valeActual.folio, nuevo: folioEfectivo };
      }
      if (deptoValeEfectivo.id !== valeActual.departamentoValeId) {
        cambios.departamentoVale = {
          anterior: valeActual.departamentoVale.nombre,
          nuevo: deptoValeEfectivo.nombre,
        };
      }
      if (areaEfectiva !== valeActual.area) {
        cambios.area = { anterior: valeActual.area, nuevo: areaEfectiva };
      }
      if (fechaSolicitudEfectiva.getTime() !== valeActual.fechaSolicitud.getTime()) {
        cambios.fechaSolicitud = {
          anterior: valeActual.fechaSolicitud.toISOString(),
          nuevo: fechaSolicitudEfectiva.toISOString(),
        };
      }
      if (tieneHoraEfectiva !== valeActual.tieneHoraSolicitud) {
        cambios.tieneHoraSolicitud = {
          anterior: valeActual.tieneHoraSolicitud,
          nuevo: tieneHoraEfectiva,
        };
      }

      // 6. Actualización con control de concurrencia sobre estados editables (no CANCELADO ni DESCONTADO)
      const updated = await tx.valeMaterial.updateMany({
        where: {
          id,
          estado: { notIn: ["CANCELADO", "DESCONTADO"] },
        },
        data: {
          serieId: serieEfectiva.id,
          folio: folioEfectivo,
          departamentoValeId: deptoValeEfectivo.id,
          area: areaEfectiva,
          fechaSolicitud: fechaSolicitudEfectiva,
          tieneHoraSolicitud: tieneHoraEfectiva,
        },
      });

      if (updated.count === 0) {
        throw new ConflictError(
          "El estado del vale cambió recientemente y ya no se encuentra disponible para edición",
        );
      }

      if (Object.keys(cambios).length > 0) {
        await tx.historialEstadoVale.create({
          data: {
            valeId: id,
            accion: "EDICION",
            estadoAnterior: valeActual.estado,
            estadoNuevo: valeActual.estado,
            usuarioId: actorId,
            cambios: cambios as Prisma.InputJsonValue,
          },
        });

        await tx.registroAuditoria.create({
          data: {
            usuarioId: actorId,
            accion: "VALE_EDITADO",
            entidad: "vales_material",
            entidadId: id,
            detalle: `Vale editado: Folio ${folioEfectivo} (${Object.keys(cambios).join(", ")})`.slice(
              0,
              255,
            ),
          },
        });
      }
    });

    const valeActualizado = await valesQueryService.getValeById(id, actorId);

    // Emisión SSE estrictamente post-commit
    valesEventPublisher.publish({
      id: randomUUID(),
      tipo: "VALE_EDITADO",
      valeId: valeActualizado.id,
      folio: valeActualizado.folio,
      serieId: valeActualizado.serieId,
      serieCodigo: valeActualizado.serie.codigo,
      departamentoId: valeActualizado.departamentoId,
      departamentoValeId: valeActualizado.departamentoValeId,
      departamentoValeNombre: valeActualizado.departamentoVale.nombre,
      area: valeActualizado.area,
      estadoAnterior: "PENDIENTE",
      estadoNuevo: valeActualizado.estado,
      actorId,
      fechaEvento: new Date().toISOString(),
    });

    return valeActualizado;
  }
}

export const valesService = new ValesService();
