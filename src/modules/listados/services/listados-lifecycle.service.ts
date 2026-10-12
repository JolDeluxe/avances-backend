import { prisma } from "../../../config/database";
import { EstadoListado, EstadoFrenteMaterial, TipoFrenteMaterial } from "@prisma/client";
import { scopeService } from "../../auth/services/scope.service";
import { NotFoundError, BadRequestError, ConflictError, ForbiddenError } from "../../../utils/errors";

interface TransicionConfig {
  origen: EstadoFrenteMaterial;
  destino: EstadoFrenteMaterial;
  requiereMotivo: boolean;
  accionAuditoria: string;
  detalleAuditoria: (numeroListado: string, frente: string, motivo?: string) => string;
}

const TRANSICIONES_VALIDAS: Record<string, TransicionConfig> = {
  "PENDIENTE->SEPARADO": {
    origen: "PENDIENTE",
    destino: "SEPARADO",
    requiereMotivo: false,
    accionAuditoria: "FRENTE_SEPARADO",
    detalleAuditoria: (num, frente) => `Frente ${frente} de Listado '${num}' separado con éxito`,
  },
  "SEPARADO->ENTREGADO": {
    origen: "SEPARADO",
    destino: "ENTREGADO",
    requiereMotivo: false,
    accionAuditoria: "FRENTE_ENTREGADO",
    detalleAuditoria: (num, frente) => `Frente ${frente} de Listado '${num}' entregado a producción`,
  },
  "SEPARADO->PENDIENTE": {
    origen: "SEPARADO",
    destino: "PENDIENTE",
    requiereMotivo: true,
    accionAuditoria: "FRENTE_RETROCEDIDO",
    detalleAuditoria: (num, frente, motivo) => `Frente ${frente} de Listado '${num}' retrocedido de SEPARADO a PENDIENTE. Motivo: ${motivo}`,
  },
  "ENTREGADO->PENDIENTE": {
    origen: "ENTREGADO",
    destino: "PENDIENTE",
    requiereMotivo: true,
    accionAuditoria: "FRENTE_RETROCEDIDO",
    detalleAuditoria: (num, frente, motivo) =>
      `Frente ${frente} de Listado '${num}' retrocedido de ENTREGADO a PENDIENTE. Motivo: ${motivo}`,
  },
  "ENTREGADO->SEPARADO": {
    origen: "ENTREGADO",
    destino: "SEPARADO",
    requiereMotivo: true,
    accionAuditoria: "FRENTE_RETROCEDIDO",
    detalleAuditoria: (num, frente, motivo) =>
      `Frente ${frente} de Listado '${num}' retrocedido de ENTREGADO a SEPARADO. Motivo: ${motivo}`,
  },
  "ENTREGADO->DESCONTADO": {
    origen: "ENTREGADO",
    destino: "DESCONTADO",
    requiereMotivo: false,
    accionAuditoria: "FRENTE_DESCONTADO",
    detalleAuditoria: (num, frente, motivo) =>
      motivo ? `Frente ${frente} de Listado '${num}' descontado. Motivo: ${motivo}` : `Frente ${frente} de Listado '${num}' validado y descontado en ERP`,
  },
};

export class ListadosLifecycleService {
  async transicionarFrente(
    listadoId: number,
    tipoFrente: TipoFrenteMaterial,
    estadoDestino: EstadoFrenteMaterial,
    usuarioId: number,
    motivo?: string,
  ) {
    const scope = await scopeService.resolveUserScope(usuarioId);
    
    // Validar scope del usuario
    if (!scope.esGlobal) {
      if (scope.tipoSurtidoAlmacen) {
        const permitidos = scope.tipoSurtidoAlmacen.split(",").map((s) => s.trim().toUpperCase());
        if (!permitidos.includes("TODOS") && !permitidos.includes(tipoFrente)) {
          throw new BadRequestError(`Su rol como ALMACENISTA solo permite operar frentes: ${permitidos.join(", ")}`);
        }
      }
      if (scope.tipoMaterialAuditor) {
        const permitidosAud = scope.tipoMaterialAuditor.split(",").map((s) => s.trim().toUpperCase());
        if (!permitidosAud.includes("TODOS") && !permitidosAud.includes(tipoFrente)) {
          throw new BadRequestError(`Su rol como AUDITOR solo permite operar frentes: ${permitidosAud.join(", ")}`);
        }
      }
    }

    const scopeWhere = scopeService.buildScopeWhere(scope);

    await prisma.$transaction(async (tx) => {
      const listado = await tx.listadoMaterial.findFirst({
        where: {
          id: listadoId,
          ...scopeWhere,
          departamento: { estado: "ACTIVO" },
          lineaProduccion: { estado: "ACTIVO" },
        },
        include: {
          lineaProduccion: { select: { id: true, codigo: true, nombre: true } },
          departamento: { select: { id: true, codigo: true, nombre: true } },
          frentes: true
        },
      });

      if (!listado) {
        throw new NotFoundError(`Listado con ID ${listadoId} no encontrado o fuera de su alcance`);
      }

      if (listado.estado === "CANCELADO") {
        throw new ConflictError(
          `El listado '${listado.numeroListado}' está en estado CANCELADO y es terminal`,
        );
      }

      const frente = listado.frentes.find(f => f.tipoFrente === tipoFrente);
      if (!frente) {
        throw new BadRequestError(`El frente ${tipoFrente} no es válido para el listado '${listado.numeroListado}'`);
      }

      if (tipoFrente === "BOLSAS" && listado.lineaProduccion.codigo !== "BOLSAS") {
        throw new BadRequestError(`El frente BOLSAS solamente está permitido cuando la línea del listado es BOLSAS`);
      }

      if (frente.estado === "DESCONTADO") {
        throw new ConflictError(
          `El frente ${tipoFrente} del listado '${listado.numeroListado}' está DESCONTADO y es irreversible`,
        );
      }

      const transitionKey = `${frente.estado}->${estadoDestino}`;
      const config = TRANSICIONES_VALIDAS[transitionKey];

      if (!config) {
        throw new BadRequestError(
          `El frente ${tipoFrente} no puede transicionar de ${frente.estado} a ${estadoDestino}`,
        );
      }

      const motivoLimpio = motivo?.trim();
      if (config.requiereMotivo) {
        if (!motivoLimpio || motivoLimpio.length === 0) {
          throw new BadRequestError(
            `La transición de ${frente.estado} a ${estadoDestino} requiere un motivo no vacío`,
          );
        }
      }

      const fechaOperacion = new Date();
      const updateFrenteData: Record<string, unknown> = { estado: estadoDestino };

      if (estadoDestino === "SEPARADO") {
        updateFrenteData.separadoPorId = usuarioId;
        updateFrenteData.fechaSeparado = fechaOperacion;
      } else if (estadoDestino === "ENTREGADO") {
        updateFrenteData.entregadoPorId = usuarioId;
        updateFrenteData.fechaEntregado = fechaOperacion;
      } else if (estadoDestino === "DESCONTADO") {
        updateFrenteData.descontadoPorId = usuarioId;
        updateFrenteData.fechaDescontado = fechaOperacion;
      }

      // Si retrocede a PENDIENTE, limpiamos separado y entregado
      if (estadoDestino === "PENDIENTE") {
        updateFrenteData.separadoPorId = null;
        updateFrenteData.fechaSeparado = null;
        updateFrenteData.entregadoPorId = null;
        updateFrenteData.fechaEntregado = null;
      }

      const resUpdate = await tx.listadoSurtidoFrente.updateMany({
        where: {
          id: frente.id,
          estado: frente.estado,
        },
        data: updateFrenteData,
      });

      if (resUpdate.count === 0) {
        throw new BadRequestError(
          `El frente '${tipoFrente}' no está en estado ${frente.estado} (estado actual modificado concurrentemente)`,
        );
      }

      // Trazabilidad por frente
      await tx.historialEstadoFrente.create({
        data: {
          listadoSurtidoFrenteId: frente.id,
          estadoAnterior: frente.estado,
          estadoNuevo: estadoDestino,
          cambiadoPorUsuarioId: usuarioId,
          fechaCambio: fechaOperacion,
          motivo: motivoLimpio ?? null,
        },
      });

      // Recalcular estado global del listado
      const nuevosFrentes = await tx.listadoSurtidoFrente.findMany({ where: { listadoMaterialId: listadoId } });
      const estadosGlobales = nuevosFrentes.map(f => f.estado);
      
      let nuevoEstadoGlobal: EstadoListado;
      
      if (estadosGlobales.every(e => e === "DESCONTADO")) {
        nuevoEstadoGlobal = "DESCONTADO";
      } else if (estadosGlobales.every(e => e === "ENTREGADO")) {
        nuevoEstadoGlobal = "ENTREGADO_A_PRODUCCION";
      } else if (estadosGlobales.every(e => e === "PENDIENTE")) {
        nuevoEstadoGlobal = "PENDIENTE";
      } else {
        nuevoEstadoGlobal = "EN_PROCESO";
      }

      if (nuevoEstadoGlobal !== listado.estado) {
        await tx.listadoMaterial.update({
          where: { id: listadoId },
          data: { estado: nuevoEstadoGlobal }
        });
        
        await tx.historialEstadoListado.create({
          data: {
            listadoMaterialId: listadoId,
            estadoAnterior: listado.estado,
            estadoNuevo: nuevoEstadoGlobal,
            cambiadoPorUsuarioId: usuarioId,
            motivo: `Actualización automática de listado a ${nuevoEstadoGlobal}`,
          },
        });
      }

      await tx.registroAuditoria.create({
        data: {
          usuarioId,
          accion: config.accionAuditoria,
          entidad: "listados_surtido_frentes",
          entidadId: frente.id,
          detalle: config.detalleAuditoria(listado.numeroListado, tipoFrente, motivoLimpio),
        },
      });
    });

    return prisma.listadoMaterial.findUniqueOrThrow({
      where: { id: listadoId },
      include: {
        lineaProduccion: { select: { id: true, codigo: true, nombre: true } },
        departamento: { select: { id: true, codigo: true, nombre: true } },
        creadoPorUsuario: { select: { id: true, usuario: true, nombre: true } },
        frentes: true,
      },
    });
  }

  async separar(id: number, usuarioId: number, tipoFrente: TipoFrenteMaterial, motivo?: string) {
    return this.transicionarFrente(id, tipoFrente, "SEPARADO", usuarioId, motivo);
  }

  async entregar(id: number, usuarioId: number, tipoFrente: TipoFrenteMaterial, motivo?: string) {
    return this.transicionarFrente(id, tipoFrente, "ENTREGADO", usuarioId, motivo);
  }

  async retroceder(id: number, usuarioId: number, tipoFrente: TipoFrenteMaterial, motivo: string) {
    const scope = await scopeService.resolveUserScope(usuarioId);
    const scopeWhere = scopeService.buildScopeWhere(scope);
    const listado = await prisma.listadoMaterial.findFirst({
       where: { id, ...scopeWhere },
       include: { frentes: { where: { tipoFrente } } }
    });
    if (!listado || listado.frentes.length === 0) {
      throw new NotFoundError(`Frente no encontrado`);
    }
    const frente = listado.frentes[0];
    if (!frente) {
      throw new NotFoundError(`Frente no encontrado`);
    }

    if (frente.estado === "DESCONTADO") {
      throw new ConflictError(`El frente ${tipoFrente} está DESCONTADO y es irreversible`);
    }

    if (frente.estado === "PENDIENTE") {
      throw new BadRequestError(`El frente ${tipoFrente} ya se encuentra en Materiales Pendientes`);
    }

    // Regla de Negocio: Retroceder siempre manda directamente a PENDIENTE (Materiales Pendientes)
    const destino: EstadoFrenteMaterial = "PENDIENTE";

    return this.transicionarFrente(id, tipoFrente, destino, usuarioId, motivo);
  }

  async cancelar(id: number, usuarioId: number, motivo: string) {
    // La cancelación es global para el listado, no por frente.
    const scope = await scopeService.resolveUserScope(usuarioId);
    const scopeWhere = scopeService.buildScopeWhere(scope);

    await prisma.$transaction(async (tx) => {
      const listado = await tx.listadoMaterial.findFirst({
        where: { id, ...scopeWhere },
        include: { frentes: true },
      });

      if (!listado) {
        throw new NotFoundError(`Listado con ID ${id} no encontrado o fuera de su alcance`);
      }

      // Regla de Negocio REGISTRADOR:
      // Solo puede cancelar listados registrados por él y que no tengan ningún avance (frentes en PENDIENTE)
      if (scope.rolCodigo === "REGISTRADOR") {
        if (listado.creadoPorUsuarioId !== usuarioId) {
          throw new ForbiddenError("Operación denegada: Un registrador solo puede cancelar listados creados por él");
        }
        const tieneAvance = listado.frentes.some(
          (f) => f.estado === "SEPARADO" || f.estado === "ENTREGADO" || f.estado === "DESCONTADO",
        );
        if (listado.estado !== "PENDIENTE" || tieneAvance) {
          throw new BadRequestError("El listado ya cuenta con interacción o avance de Almacén y no puede ser cancelado por el registrador");
        }
      }

      if (listado.estado === "DESCONTADO" || listado.estado === "CANCELADO") {
         throw new ConflictError("Listado no puede ser cancelado");
      }

      if (listado.estado === "ENTREGADO_A_PRODUCCION" || listado.frentes.some(f => f.estado === "ENTREGADO" || f.estado === "DESCONTADO")) {
        throw new BadRequestError("El listado no puede transicionar de ENTREGADO_A_PRODUCCION a CANCELADO directamente; debe retroceder los frentes primero");
      }

      await tx.listadoMaterial.update({
         where: { id },
         data: { estado: "CANCELADO" }
      });

      await tx.historialEstadoListado.create({
        data: {
          listadoMaterialId: id,
          estadoAnterior: listado.estado,
          estadoNuevo: "CANCELADO",
          cambiadoPorUsuarioId: usuarioId,
          motivo,
        },
      });
    });

    return prisma.listadoMaterial.findUniqueOrThrow({
      where: { id },
      include: { frentes: true, lineaProduccion: true, departamento: true, creadoPorUsuario: true }
    });
  }

  async descontar(id: number, usuarioId: number, tipoFrente: TipoFrenteMaterial, motivo?: string) {
    return this.transicionarFrente(id, tipoFrente, "DESCONTADO", usuarioId, motivo);
  }

  /**
   * Ejecuta transiciones operativas en lote (separar, entregar o descontar)
   * procesando cada listado individualmente para reportar éxitos y errores detallados.
   */
  async batchOperar(
    ids: number[],
    accion: "separar" | "entregar" | "descontar",
    usuarioId: number,
    tipoFrente?: TipoFrenteMaterial,
    motivo?: string,
  ) {
    const exitosos: Array<{ id: number; numeroListado: string }> = [];
    const fallidos: Array<{ id: number; error: string; numeroListado?: string }> = [];

    for (const id of ids) {
      try {
        let listadoActualizado;
        if (accion === "separar") {
          if (!tipoFrente) {
            throw new BadRequestError("El tipo de frente es requerido para separar");
          }
          listadoActualizado = await this.separar(id, usuarioId, tipoFrente, motivo);
        } else if (accion === "entregar") {
          if (!tipoFrente) {
            throw new BadRequestError("El tipo de frente es requerido para entregar");
          }
          listadoActualizado = await this.entregar(id, usuarioId, tipoFrente, motivo);
        } else if (accion === "descontar") {
          if (!tipoFrente) {
            throw new BadRequestError("El tipo de frente es requerido para descontar");
          }
          listadoActualizado = await this.descontar(id, usuarioId, tipoFrente, motivo);
        } else {
          throw new BadRequestError(`Acción no soportada: ${accion}`);
        }

        exitosos.push({
          id: listadoActualizado.id,
          numeroListado: listadoActualizado.numeroListado,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Error desconocido al procesar el listado";
        fallidos.push({
          id,
          error: errorMsg,
        });
      }
    }

    return {
      total: ids.length,
      procesados: exitosos.length,
      fallidosCount: fallidos.length,
      exitosos,
      fallidos,
    };
  }
}

export const listadosLifecycleService = new ListadosLifecycleService();
