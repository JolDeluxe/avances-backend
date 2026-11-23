import { randomUUID } from "node:crypto";
import type { AccionHistorialVale, AreaVale, EstadoVale, Prisma } from "@prisma/client";
import { prisma } from "../../../config/database";
import { PERMISOS } from "../../../config/permissions";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../utils/errors";
import type {
  BatchOperarValesInput,
  CancelarValeInput,
  DescontarValeInput,
  EntregarValeInput,
  RetrocederValeInput,
  SepararValeInput,
} from "../vales.schema";
import { valesEventPublisher } from "../events";
import { valesScopeService } from "./vales-scope.service";
import { valesQueryService } from "./vales-query.service";

const RETROCESO_PASO_INMEDIATO: Partial<Record<EstadoVale, EstadoVale>> = {
  DESCONTADO: "ENTREGADO",
  ENTREGADO: "PENDIENTE",
  SEPARADO: "PENDIENTE",
};

export class ValesLifecycleService {
  /**
   * Separa un vale en PENDIENTE (PENDIENTE -> SEPARADO) o ejecuta la operación
   * combinada atómica "Separar y Entregar" (PENDIENTE -> ENTREGADO) en una sola transacción.
   */
  async separar(
    id: number,
    input: SepararValeInput,
    actorId: number,
    actorPermisos: string[],
  ) {
    const entregarTambien = Boolean(input.entregarTambien);

    if (!actorPermisos.includes(PERMISOS.VALE_SEPARAR)) {
      throw new ForbiddenError("No cuenta con el permiso necesario para separar vales");
    }

    if (entregarTambien && !actorPermisos.includes(PERMISOS.VALE_ENTREGAR)) {
      throw new ForbiddenError(
        "La operación combinada 'Separar y Entregar' requiere también el permiso de entrega de vales",
      );
    }

    const scope = await valesScopeService.resolveScope(actorId);

    const vale = await prisma.valeMaterial.findUnique({
      where: { id },
      include: {
        departamentoVale: { select: { id: true, nombre: true } },
        serie: { select: { id: true, codigo: true } },
      },
    });

    if (!vale || (!scope.esGlobal && vale.departamentoId !== scope.departamentoId)) {
      throw new NotFoundError(`Vale con ID ${id} no encontrado`);
    }

    valesScopeService.assertCanOperateVale(scope, {
      departamentoId: vale.departamentoId,
      area: vale.area,
      departamentoValeId: vale.departamentoValeId,
      folio: vale.folio,
      departamentoValeNombre: vale.departamentoVale.nombre,
    });

    if (vale.estado !== "PENDIENTE") {
      throw new BadRequestError(
        `Solo se pueden separar vales en estado PENDIENTE (estado actual: ${vale.estado})`,
      );
    }

    const now = new Date();
    const estadoNuevo: EstadoVale = entregarTambien ? "ENTREGADO" : "SEPARADO";
    const accionHistorial: AccionHistorialVale = entregarTambien
      ? "SEPARACION_Y_ENTREGA"
      : "SEPARACION";

    await prisma.$transaction(async (tx) => {
      const updated = await tx.valeMaterial.updateMany({
        where: {
          id,
          estado: "PENDIENTE",
        },
        data: {
          estado: estadoNuevo,
          separadoPorId: actorId,
          fechaSeparado: now,
          ...(entregarTambien && {
            entregadoPorId: actorId,
            fechaEntregado: now,
          }),
        },
      });

      if (updated.count === 0) {
        throw new ConflictError(
          "El vale ya fue procesado recientemente por otro usuario. Recargue la vista.",
        );
      }

      await tx.historialEstadoVale.create({
        data: {
          valeId: id,
          accion: accionHistorial,
          estadoAnterior: "PENDIENTE",
          estadoNuevo,
          usuarioId: actorId,
        },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId,
          accion: entregarTambien ? "VALE_SEPARADO_Y_ENTREGADO" : "VALE_SEPARADO",
          entidad: "vales_material",
          entidadId: id,
          detalle: entregarTambien
            ? `Vale separado y entregado atómicamente: ${vale.serie.codigo} ${vale.folio} (${vale.departamentoVale.nombre})`
            : `Vale separado en almacén: ${vale.serie.codigo} ${vale.folio} (${vale.departamentoVale.nombre})`,
        },
      });
    });

    const valeActualizado = await valesQueryService.getValeById(id, actorId);

    // Emisión SSE estrictamente post-commit
    valesEventPublisher.publish({
      id: randomUUID(),
      tipo: entregarTambien ? "VALE_SEPARADO_Y_ENTREGADO" : "VALE_SEPARADO",
      valeId: valeActualizado.id,
      folio: valeActualizado.folio,
      serieId: valeActualizado.serieId,
      serieCodigo: valeActualizado.serie.codigo,
      departamentoId: valeActualizado.departamentoId,
      departamentoValeId: valeActualizado.departamentoValeId,
      departamentoValeNombre: valeActualizado.departamentoVale.nombre,
      area: valeActualizado.area,
      estadoAnterior: "PENDIENTE",
      estadoNuevo,
      actorId,
      actorNombre: valeActualizado.separadoPor?.nombre,
      fechaEvento: now.toISOString(),
    });

    return valeActualizado;
  }

  /**
   * Registra la entrega a producción de un vale previamente separado (SEPARADO -> ENTREGADO).
   */
  async entregar(
    id: number,
    input: EntregarValeInput,
    actorId: number,
    actorPermisos: string[],
  ) {
    if (!actorPermisos.includes(PERMISOS.VALE_ENTREGAR)) {
      throw new ForbiddenError("No cuenta con el permiso necesario para entregar vales");
    }

    const scope = await valesScopeService.resolveScope(actorId);

    const vale = await prisma.valeMaterial.findUnique({
      where: { id },
      include: {
        departamentoVale: { select: { id: true, nombre: true } },
        serie: { select: { id: true, codigo: true } },
      },
    });

    if (!vale || (!scope.esGlobal && vale.departamentoId !== scope.departamentoId)) {
      throw new NotFoundError(`Vale con ID ${id} no encontrado`);
    }

    valesScopeService.assertCanOperateVale(scope, {
      departamentoId: vale.departamentoId,
      area: vale.area,
      departamentoValeId: vale.departamentoValeId,
      folio: vale.folio,
      departamentoValeNombre: vale.departamentoVale.nombre,
    });

    if (vale.estado !== "SEPARADO") {
      throw new BadRequestError(
        `Solo se pueden entregar vales que estén en estado SEPARADO (estado actual: ${vale.estado})`,
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.valeMaterial.updateMany({
        where: {
          id,
          estado: "SEPARADO",
        },
        data: {
          estado: "ENTREGADO",
          entregadoPorId: actorId,
          fechaEntregado: now,
        },
      });

      if (updated.count === 0) {
        throw new ConflictError(
          "El vale ya fue modificado recientemente por otro usuario. Recargue la vista.",
        );
      }

      await tx.historialEstadoVale.create({
        data: {
          valeId: id,
          accion: "ENTREGA",
          estadoAnterior: "SEPARADO",
          estadoNuevo: "ENTREGADO",
          usuarioId: actorId,
        },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId,
          accion: "VALE_ENTREGADO",
          entidad: "vales_material",
          entidadId: id,
          detalle: `Vale entregado a producción: ${vale.serie.codigo} ${vale.folio} (${vale.departamentoVale.nombre})`,
        },
      });
    });

    const valeActualizado = await valesQueryService.getValeById(id, actorId);

    valesEventPublisher.publish({
      id: randomUUID(),
      tipo: "VALE_ENTREGADO",
      valeId: valeActualizado.id,
      folio: valeActualizado.folio,
      serieId: valeActualizado.serieId,
      serieCodigo: valeActualizado.serie.codigo,
      departamentoId: valeActualizado.departamentoId,
      departamentoValeId: valeActualizado.departamentoValeId,
      departamentoValeNombre: valeActualizado.departamentoVale.nombre,
      area: valeActualizado.area,
      estadoAnterior: "SEPARADO",
      estadoNuevo: "ENTREGADO",
      actorId,
      actorNombre: valeActualizado.entregadoPor?.nombre,
      fechaEvento: now.toISOString(),
    });

    return valeActualizado;
  }

  /**
   * Registra en nuestra aplicación que el descuento externo del vale entregado ya fue realizado (ENTREGADO -> DESCONTADO).
   */
  async descontar(
    id: number,
    _input: DescontarValeInput,
    actorId: number,
    actorPermisos: string[],
  ) {
    if (!actorPermisos.includes(PERMISOS.VALE_DESCONTAR)) {
      throw new ForbiddenError("No cuenta con el permiso necesario para descontar vales");
    }

    const scope = await valesScopeService.resolveScope(actorId);

    const vale = await prisma.valeMaterial.findUnique({
      where: { id },
      include: {
        departamentoVale: { select: { id: true, nombre: true } },
        serie: { select: { id: true, codigo: true } },
      },
    });

    if (!vale || (!scope.esGlobal && vale.departamentoId !== scope.departamentoId)) {
      throw new NotFoundError(`Vale con ID ${id} no encontrado`);
    }

    // Validar alcance operativo (impide que un usuario con alcance acotado opere fuera de su alcance mediante excepción de permisos)
    valesScopeService.assertCanOperateVale(scope, {
      departamentoId: vale.departamentoId,
      area: vale.area,
      departamentoValeId: vale.departamentoValeId,
      folio: vale.folio,
      departamentoValeNombre: vale.departamentoVale.nombre,
    });

    if (vale.estado !== "ENTREGADO") {
      throw new BadRequestError(
        `Solo se puede registrar como DESCONTADO un vale que ya fue ENTREGADO a producción (estado actual: ${vale.estado})`,
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.valeMaterial.updateMany({
        where: {
          id,
          estado: "ENTREGADO",
        },
        data: {
          estado: "DESCONTADO",
          descontadoPorId: actorId,
          fechaDescontado: now,
        },
      });

      if (updated.count === 0) {
        throw new ConflictError(
          "El vale ya fue descontado o modificado recientemente por otro usuario.",
        );
      }

      await tx.historialEstadoVale.create({
        data: {
          valeId: id,
          accion: "DESCUENTO",
          estadoAnterior: "ENTREGADO",
          estadoNuevo: "DESCONTADO",
          usuarioId: actorId,
        },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId,
          accion: "VALE_DESCONTADO",
          entidad: "vales_material",
          entidadId: id,
          detalle: `Confirmación de descuento externo registrada para vale: ${vale.serie.codigo} ${vale.folio}`,
        },
      });
    });

    const valeActualizado = await valesQueryService.getValeById(id, actorId);

    valesEventPublisher.publish({
      id: randomUUID(),
      tipo: "VALE_DESCONTADO",
      valeId: valeActualizado.id,
      folio: valeActualizado.folio,
      serieId: valeActualizado.serieId,
      serieCodigo: valeActualizado.serie.codigo,
      departamentoId: valeActualizado.departamentoId,
      departamentoValeId: valeActualizado.departamentoValeId,
      departamentoValeNombre: valeActualizado.departamentoVale.nombre,
      area: valeActualizado.area,
      estadoAnterior: "ENTREGADO",
      estadoNuevo: "DESCONTADO",
      actorId,
      actorNombre: valeActualizado.descontadoPor?.nombre,
      fechaEvento: now.toISOString(),
    });

    return valeActualizado;
  }

  /**
   * Retrocede estrictamente un paso inmediato el estado de un vale con motivo obligatorio:
   * - DESCONTADO -> ENTREGADO (requiere permiso vale:retroceder_descuento o vale:retroceder)
   * - ENTREGADO -> SEPARADO (requiere permiso vale:retroceder)
   * - SEPARADO -> PENDIENTE (requiere permiso vale:retroceder)
   * Limpia los campos de la etapa revertida y conserva el historial inmutable.
   */
  async retroceder(
    id: number,
    input: RetrocederValeInput,
    actorId: number,
    actorPermisos: string[],
  ) {
    const scope = await valesScopeService.resolveScope(actorId);

    const vale = await prisma.valeMaterial.findUnique({
      where: { id },
      include: {
        departamentoVale: { select: { id: true, nombre: true } },
        serie: { select: { id: true, codigo: true } },
      },
    });

    if (!vale || (!scope.esGlobal && vale.departamentoId !== scope.departamentoId)) {
      throw new NotFoundError(`Vale con ID ${id} no encontrado`);
    }

    // Validar alcance operativo (impide retroceder vales fuera de las áreas/departamentos autorizados)
    valesScopeService.assertCanOperateVale(scope, {
      departamentoId: vale.departamentoId,
      area: vale.area,
      departamentoValeId: vale.departamentoValeId,
      folio: vale.folio,
      departamentoValeNombre: vale.departamentoVale.nombre,
    });

    const estadoAnterior = vale.estado;
    const estadoDestinoPermitido = RETROCESO_PASO_INMEDIATO[estadoAnterior];

    if (!estadoDestinoPermitido) {
      throw new BadRequestError(
        `No es posible retroceder un vale que se encuentra en estado ${estadoAnterior}`,
      );
    }

    if (input.estadoDestino && input.estadoDestino !== estadoDestinoPermitido) {
      throw new BadRequestError(
        `El retroceso desde ${estadoAnterior} solo se puede realizar a ${estadoDestinoPermitido}`,
      );
    }

    // Validación por permiso efectivo específico según el tramo (sin acoplar al nombre del rol)
    if (estadoAnterior === "DESCONTADO") {
      const puedeRevertirDescuento =
        actorPermisos.includes(PERMISOS.VALE_RETROCEDER_DESCUENTO) ||
        actorPermisos.includes(PERMISOS.VALE_RETROCEDER);
      if (!puedeRevertirDescuento) {
        throw new ForbiddenError(
          "No cuenta con el permiso necesario para revertir el descuento de un vale (DESCONTADO -> ENTREGADO)",
        );
      }
    } else {
      const puedeRetrocederOperacion = actorPermisos.includes(PERMISOS.VALE_RETROCEDER);
      if (!puedeRetrocederOperacion) {
        throw new ForbiddenError(
          `No cuenta con el permiso necesario (${PERMISOS.VALE_RETROCEDER}) para retroceder un vale de ${estadoAnterior} a ${estadoDestinoPermitido}`,
        );
      }
    }

    const now = new Date();
    const motivoLimpio = input.motivo.trim();

    // Limpieza determinista de marcas posteriores según la matriz definitiva
    const camposLimpieza: Prisma.ValeMaterialUncheckedUpdateManyInput =
      estadoDestinoPermitido === "ENTREGADO"
        ? {
            descontadoPorId: null,
            fechaDescontado: null,
          }
        : estadoDestinoPermitido === "SEPARADO"
        ? {
            entregadoPorId: null,
            fechaEntregado: null,
            descontadoPorId: null,
            fechaDescontado: null,
          }
        : {
            separadoPorId: null,
            fechaSeparado: null,
            entregadoPorId: null,
            fechaEntregado: null,
            descontadoPorId: null,
            fechaDescontado: null,
          };

    await prisma.$transaction(async (tx) => {
      const updated = await tx.valeMaterial.updateMany({
        where: {
          id,
          estado: estadoAnterior,
        },
        data: {
          estado: estadoDestinoPermitido,
          revertidoPorId: actorId,
          fechaRevertido: now,
          motivoReversion: motivoLimpio,
          ...camposLimpieza,
        },
      });

      if (updated.count === 0) {
        throw new ConflictError(
          "El estado del vale cambió recientemente por otro usuario. Recargue la vista.",
        );
      }

      await tx.historialEstadoVale.create({
        data: {
          valeId: id,
          accion: "RETROCESO",
          estadoAnterior,
          estadoNuevo: estadoDestinoPermitido,
          usuarioId: actorId,
          motivo: motivoLimpio,
        },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId,
          accion: "VALE_RETROCEDIDO",
          entidad: "vales_material",
          entidadId: id,
          detalle: `Retroceso de vale ${vale.serie.codigo} ${vale.folio}: ${estadoAnterior} -> ${estadoDestinoPermitido} | Motivo: ${motivoLimpio}`.slice(
            0,
            255,
          ),
        },
      });
    });

    const valeActualizado = await valesQueryService.getValeById(id, actorId);

    valesEventPublisher.publish({
      id: randomUUID(),
      tipo: "VALE_RETROCEDIDO",
      valeId: valeActualizado.id,
      folio: valeActualizado.folio,
      serieId: valeActualizado.serieId,
      serieCodigo: valeActualizado.serie.codigo,
      departamentoId: valeActualizado.departamentoId,
      departamentoValeId: valeActualizado.departamentoValeId,
      departamentoValeNombre: valeActualizado.departamentoVale.nombre,
      area: valeActualizado.area,
      estadoAnterior,
      estadoNuevo: estadoDestinoPermitido,
      actorId,
      actorNombre: valeActualizado.revertidoPor?.nombre,
      motivo: motivoLimpio,
      fechaEvento: now.toISOString(),
    });

    return valeActualizado;
  }

  /**
   * Cancela lógicamente un vale (PENDIENTE o SEPARADO -> CANCELADO) con motivo obligatorio.
   * - En PENDIENTE: requiere permiso `vale:cancelar`.
   * - En SEPARADO: como ya existe interacción física de almacén, además de `vale:cancelar` requiere
   *   capacidad operativa sobre almacén/retroceso (`vale:retroceder` o `vale:separar`). Un usuario con solo
   *   permisos de registro (`REGISTRADOR`) no puede cancelar un vale que ya fue separado por almacén.
   * - Valida siempre el alcance operativo del usuario.
   */
  async cancelar(
    id: number,
    input: CancelarValeInput,
    actorId: number,
    actorPermisos: string[],
  ) {
    if (!actorPermisos.includes(PERMISOS.VALE_CANCELAR)) {
      throw new ForbiddenError("No cuenta con el permiso necesario para cancelar vales");
    }

    const scope = await valesScopeService.resolveScope(actorId);

    const vale = await prisma.valeMaterial.findUnique({
      where: { id },
      include: {
        departamentoVale: { select: { id: true, nombre: true } },
        serie: { select: { id: true, codigo: true } },
      },
    });

    if (!vale || (!scope.esGlobal && vale.departamentoId !== scope.departamentoId)) {
      throw new NotFoundError(`Vale con ID ${id} no encontrado`);
    }

    // Validar alcance operativo (impide cancelar vales fuera de las áreas/departamentos autorizados)
    valesScopeService.assertCanOperateVale(scope, {
      departamentoId: vale.departamentoId,
      area: vale.area,
      departamentoValeId: vale.departamentoValeId,
      folio: vale.folio,
      departamentoValeNombre: vale.departamentoVale.nombre,
    });

    if (vale.estado === "CANCELADO") {
      throw new BadRequestError("El vale ya se encuentra cancelado");
    }

    if (vale.estado === "ENTREGADO" || vale.estado === "DESCONTADO") {
      throw new BadRequestError(
        `No se puede cancelar un vale que ya fue entregado a producción o descontado (estado actual: ${vale.estado})`,
      );
    }

    // Regla operativa homóloga a LISTADOS basada en capacidades efectivas:
    // Si el vale ya fue SEPARADO por almacén, un usuario que solo posee permisos de registro/cancelación
    // (sin capacidad de retroceso ni separación en almacén) no puede cancelarlo directamente.
    if (vale.estado === "SEPARADO") {
      const tieneCapacidadSobreSeparado =
        actorPermisos.includes(PERMISOS.VALE_RETROCEDER) ||
        actorPermisos.includes(PERMISOS.VALE_SEPARAR);

      if (!tieneCapacidadSobreSeparado) {
        throw new ForbiddenError(
          "El vale ya cuenta con avance de almacén (SEPARADO) y no puede ser cancelado sin autorización de retroceso/almacén. Solicite primero su retroceso a PENDIENTE.",
        );
      }
    }

    const estadoAnterior = vale.estado;
    const now = new Date();
    const motivoLimpio = input.motivo.trim();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.valeMaterial.updateMany({
        where: {
          id,
          estado: estadoAnterior,
        },
        data: {
          estado: "CANCELADO",
          canceladoPorId: actorId,
          fechaCancelacion: now,
          motivoCancelacion: motivoLimpio,
        },
      });

      if (updated.count === 0) {
        throw new ConflictError(
          "El estado del vale cambió recientemente por otro usuario. Recargue la vista.",
        );
      }

      await tx.historialEstadoVale.create({
        data: {
          valeId: id,
          accion: "CANCELACION",
          estadoAnterior,
          estadoNuevo: "CANCELADO",
          usuarioId: actorId,
          motivo: motivoLimpio,
        },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId,
          accion: "VALE_CANCELADO",
          entidad: "vales_material",
          entidadId: id,
          detalle: `Vale cancelado: ${vale.serie.codigo} ${vale.folio} (desde ${estadoAnterior}) | Motivo: ${motivoLimpio}`.slice(
            0,
            255,
          ),
        },
      });
    });

    const valeActualizado = await valesQueryService.getValeById(id, actorId);

    valesEventPublisher.publish({
      id: randomUUID(),
      tipo: "VALE_CANCELADO",
      valeId: valeActualizado.id,
      folio: valeActualizado.folio,
      serieId: valeActualizado.serieId,
      serieCodigo: valeActualizado.serie.codigo,
      departamentoId: valeActualizado.departamentoId,
      departamentoValeId: valeActualizado.departamentoValeId,
      departamentoValeNombre: valeActualizado.departamentoVale.nombre,
      area: valeActualizado.area,
      estadoAnterior,
      estadoNuevo: "CANCELADO",
      actorId,
      actorNombre: valeActualizado.canceladoPor?.nombre,
      motivo: motivoLimpio,
      fechaEvento: now.toISOString(),
    });

    return valeActualizado;
  }

  /**
   * Operación por lote con política estricta Todo o Nada (All-or-Nothing):
   * 1. Valida permisos efectivos según acción.
   * 2. Valida existencia y pertenencia al mismo departamento organizacional de todos los IDs.
   * 3. Valida alcance operativo para TODOS los registros del lote.
   * 4. Comprueba que todos los registros estén en el estado origen requerido.
   * 5. Ejecuta las modificaciones en una sola transacción; si uno falla o cambia concurrentemente, revierte todo el lote.
   */
  async batchOperar(
    input: BatchOperarValesInput,
    actorId: number,
    actorPermisos: string[],
  ) {
    const { accion } = input;
    const uniqueIds = Array.from(new Set(input.valeIds));

    // 1. Validar permisos efectivos según acción solicitada
    if (accion === "SEPARAR" && !actorPermisos.includes(PERMISOS.VALE_SEPARAR)) {
      throw new ForbiddenError("No cuenta con el permiso necesario para separar vales en lote");
    }
    if (accion === "ENTREGAR" && !actorPermisos.includes(PERMISOS.VALE_ENTREGAR)) {
      throw new ForbiddenError("No cuenta con el permiso necesario para entregar vales en lote");
    }
    if (
      accion === "SEPARAR_Y_ENTREGAR" &&
      (!actorPermisos.includes(PERMISOS.VALE_SEPARAR) ||
        !actorPermisos.includes(PERMISOS.VALE_ENTREGAR))
    ) {
      throw new ForbiddenError(
        "La operación en lote 'Separar y Entregar' requiere los permisos de separar y entregar vales",
      );
    }
    if (accion === "DESCONTAR" && !actorPermisos.includes(PERMISOS.VALE_DESCONTAR)) {
      throw new ForbiddenError("No cuenta con el permiso necesario para descontar vales en lote");
    }

    const scope = await valesScopeService.resolveScope(actorId);

    const estadoOrigenEsperado: EstadoVale =
      accion === "SEPARAR" || accion === "SEPARAR_Y_ENTREGAR"
        ? "PENDIENTE"
        : accion === "ENTREGAR"
        ? "SEPARADO"
        : "ENTREGADO";

    const estadoNuevo: EstadoVale =
      accion === "SEPARAR"
        ? "SEPARADO"
        : accion === "ENTREGAR" || accion === "SEPARAR_Y_ENTREGAR"
        ? "ENTREGADO"
        : "DESCONTADO";

    const accionHistorial: AccionHistorialVale =
      accion === "SEPARAR"
        ? "SEPARACION"
        : accion === "ENTREGAR"
        ? "ENTREGA"
        : accion === "SEPARAR_Y_ENTREGAR"
        ? "SEPARACION_Y_ENTREGA"
        : "DESCUENTO";

    const now = new Date();

    // Ejecutar validación integral + actualización en una única transacción Todo o Nada
    const resultadoLote = await prisma.$transaction(async (tx) => {
      // 2. Cargar todos los vales solicitados
      const valesEncontrados = await tx.valeMaterial.findMany({
        where: {
          id: { in: uniqueIds },
        },
        include: {
          departamentoVale: { select: { id: true, nombre: true } },
        },
      });

      if (valesEncontrados.length !== uniqueIds.length) {
        const encontradosSet = new Set(valesEncontrados.map((v) => v.id));
        const faltantes = uniqueIds.filter((id) => !encontradosSet.has(id));
        throw new NotFoundError(
          `Uno o más vales del lote no existen (IDs: ${faltantes.join(", ")})`,
        );
      }

      const primerDepartamentoId = valesEncontrados[0]!.departamentoId;

      // 3. Validar aislamiento organizacional, alcance operativo y estado de cada vale del lote
      for (const vale of valesEncontrados) {
        if (!scope.esGlobal && vale.departamentoId !== scope.departamentoId) {
          throw new ForbiddenError(
            `El vale ${vale.folio} (ID ${vale.id}) pertenece a otro departamento organizacional`,
          );
        }

        if (vale.departamentoId !== primerDepartamentoId) {
          throw new BadRequestError(
            "Todos los vales de una operación en lote deben pertenecer al mismo departamento organizacional",
          );
        }

        valesScopeService.assertCanOperateVale(scope, {
          departamentoId: vale.departamentoId,
          area: vale.area,
          departamentoValeId: vale.departamentoValeId,
          folio: vale.folio,
          departamentoValeNombre: vale.departamentoVale.nombre,
        });

        if (vale.estado !== estadoOrigenEsperado) {
          throw new ConflictError(
            `Operación en lote cancelada: el vale "${vale.folio}" (ID ${vale.id}) se encuentra en estado ${vale.estado} y se requería ${estadoOrigenEsperado}`,
          );
        }
      }

      // 4. Actualizar todos los registros verificando que ninguno haya cambiado concurrentemente
      const updateData: Prisma.ValeMaterialUncheckedUpdateManyInput =
        accion === "SEPARAR"
          ? {
              estado: "SEPARADO",
              separadoPorId: actorId,
              fechaSeparado: now,
            }
          : accion === "ENTREGAR"
          ? {
              estado: "ENTREGADO",
              entregadoPorId: actorId,
              fechaEntregado: now,
            }
          : accion === "SEPARAR_Y_ENTREGAR"
          ? {
              estado: "ENTREGADO",
              separadoPorId: actorId,
              fechaSeparado: now,
              entregadoPorId: actorId,
              fechaEntregado: now,
            }
          : {
              estado: "DESCONTADO",
              descontadoPorId: actorId,
              fechaDescontado: now,
            };

      const updated = await tx.valeMaterial.updateMany({
        where: {
          id: { in: uniqueIds },
          estado: estadoOrigenEsperado,
        },
        data: updateData,
      });

      // Si algún registro cambió en medio, abortar y revertir toda la transacción
      if (updated.count !== uniqueIds.length) {
        throw new ConflictError(
          "Uno o más vales del lote cambiaron de estado concurrentemente. Ningún registro fue modificado; recargue la vista.",
        );
      }

      // 5. Registrar trazabilidad en HistorialEstadoVale y RegistroAuditoria para todos los vales
      await tx.historialEstadoVale.createMany({
        data: uniqueIds.map((valeId) => ({
          valeId,
          accion: accionHistorial,
          estadoAnterior: estadoOrigenEsperado,
          estadoNuevo,
          usuarioId: actorId,
          fechaCambio: now,
        })),
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId,
          accion: `VALES_LOTE_${accion}`,
          entidad: "vales_material",
          entidadId: uniqueIds[0] ?? null,
          detalle: `Lote ${accion} aplicado a ${uniqueIds.length} vales (IDs: ${uniqueIds.join(",")})`.slice(
            0,
            255,
          ),
        },
      });

      const areasAfectadas = Array.from(new Set(valesEncontrados.map((v) => v.area)));
      const deptosValeAfectados = Array.from(
        new Set(valesEncontrados.map((v) => v.departamentoValeId)),
      );
      const loteItems = valesEncontrados.map((v) => ({
        id: v.id,
        area: v.area,
        departamentoValeId: v.departamentoValeId,
      }));

      return {
        procesados: uniqueIds.length,
        valeIds: uniqueIds,
        accion,
        estadoAnterior: estadoOrigenEsperado,
        estadoNuevo,
        departamentoId: primerDepartamentoId,
        areasAfectadas,
        deptosValeAfectados,
        loteItems,
      };
    });

    // Emisión SSE estrictamente post-commit
    valesEventPublisher.publish({
      id: randomUUID(),
      tipo: "VALES_LOTE_OPERADO",
      valeIds: resultadoLote.valeIds,
      loteItems: resultadoLote.loteItems,
      departamentoId: resultadoLote.departamentoId,
      areas: resultadoLote.areasAfectadas as AreaVale[],
      departamentoValeIds: resultadoLote.deptosValeAfectados,
      estadoAnterior: resultadoLote.estadoAnterior,
      estadoNuevo: resultadoLote.estadoNuevo,
      actorId,
      fechaEvento: now.toISOString(),
    });

    const { loteItems: _omit, ...respuestaCliente } = resultadoLote;
    return respuestaCliente;
  }
}

export const valesLifecycleService = new ValesLifecycleService();
