import { prisma } from "../../../config/database";
import { Prisma } from "@prisma/client";
import { scopeService } from "../../auth/services/scope.service";
import { listadosEventPublisher } from "../events";
import { listadosQueryService } from "./listados-query.service";
import { listadosLifecycleService } from "./listados-lifecycle.service";
import { NotFoundError, BadRequestError, ConflictError } from "../../../utils/errors";
import type { CreateListadoInput, UpdateListadoInput, ListListadosQuery } from "../listados.schema";

export class ListadosService {
  // Delegaciones de lectura hacia listadosQueryService
  async getListados(usuarioId: number, filtros: Partial<ListListadosQuery> = {}) {
    return listadosQueryService.getListados(usuarioId, filtros);
  }

  async getListadoById(id: number, usuarioId: number) {
    return listadosQueryService.getListadoById(id, usuarioId);
  }

  async getAniosDisponibles(usuarioId: number) {
    return listadosQueryService.getAniosDisponibles(usuarioId);
  }

  // Delegaciones de ciclo de vida hacia listadosLifecycleService
  async separarListado(id: number, usuarioId: number, tipoFrente: "DIRECTOS" | "INDIRECTOS" | "BOLSAS", motivo?: string) {
    return listadosLifecycleService.separar(id, usuarioId, tipoFrente, motivo);
  }

  async entregarListado(id: number, usuarioId: number, tipoFrente: "DIRECTOS" | "INDIRECTOS" | "BOLSAS", motivo?: string) {
    return listadosLifecycleService.entregar(id, usuarioId, tipoFrente, motivo);
  }

  async retrocederListado(id: number, usuarioId: number, tipoFrente: "DIRECTOS" | "INDIRECTOS" | "BOLSAS", motivo: string) {
    return listadosLifecycleService.retroceder(id, usuarioId, tipoFrente, motivo);
  }

  async cancelarListado(id: number, usuarioId: number, motivo: string) {
    return listadosLifecycleService.cancelar(id, usuarioId, motivo);
  }

  async descontarListado(id: number, usuarioId: number, tipoFrente: "DIRECTOS" | "INDIRECTOS" | "BOLSAS", motivo?: string) {
    return listadosLifecycleService.descontar(id, usuarioId, tipoFrente, motivo);
  }

  /**
   * Crea un nuevo listado asociando departamento y línea validados con el alcance del usuario.
   */
  async createListado(data: CreateListadoInput, usuarioId: number) {
    const scope = await scopeService.resolveUserScope(usuarioId);

    const linea = await prisma.lineaProduccion.findUnique({
      where: { id: data.lineaProduccionId },
      include: { departamento: true },
    });

    if (!linea || linea.estado !== "ACTIVO" || linea.departamento.estado !== "ACTIVO") {
      throw new BadRequestError(`La línea de producción ID ${data.lineaProduccionId} no existe o no está activa`);
    }

    // Validar alcance estricto de destino
    scopeService.validateDestinationScope(scope, {
      departamentoId: linea.departamentoId,
      lineaProduccionId: linea.id,
    });

    // Validar unicidad del número de listado
    const existente = await prisma.listadoMaterial.findUnique({
      where: { numeroListado: data.numeroListado },
    });

    if (existente) {
      throw new ConflictError(`Ya existe un listado con el número '${data.numeroListado}'`);
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const frentesData: Prisma.ListadoSurtidoFrenteCreateWithoutListadoInput[] = [
        { tipoFrente: "DIRECTOS", estado: "PENDIENTE" },
        { tipoFrente: "INDIRECTOS", estado: "PENDIENTE" }
      ];
      if (linea.codigo === "BOLSAS") {
        frentesData.push({ tipoFrente: "BOLSAS", estado: "PENDIENTE" });
      }

      const nuevo = await tx.listadoMaterial.create({
        data: {
          numeroListado: data.numeroListado,
          fechaRequerida: new Date(data.fechaRequerida),
          departamentoId: linea.departamentoId,
          lineaProduccionId: data.lineaProduccionId,
          estado: "PENDIENTE",
          creadoPorUsuarioId: usuarioId,
          frentes: {
            create: frentesData
          }
        },
        include: {
          lineaProduccion: { select: { id: true, codigo: true, nombre: true, area: true } },
          departamento: { select: { id: true, codigo: true, nombre: true } },
          creadoPorUsuario: { select: { id: true, usuario: true, nombre: true } },
          frentes: true,
        },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId,
          accion: "LISTADO_CREADO",
          entidad: "listados_material",
          entidadId: nuevo.id,
          detalle: `Listado creado: ${nuevo.numeroListado} para línea ${linea.codigo}`,
        },
      });

      return nuevo;
    });

    // Publicación post-commit: la transacción ya confirmó con éxito en BD
    listadosEventPublisher.publish({
      id: crypto.randomUUID(),
      tipo: "LISTADO_CREADO",
      timestamp: new Date().toISOString(),
      listadoId: resultado.id,
      numeroListado: resultado.numeroListado,
      departamentoId: resultado.departamentoId,
      lineaProduccionId: resultado.lineaProduccionId,
      lineaCodigo: resultado.lineaProduccion.codigo,
      estadoGlobal: resultado.estado,
      frentes: resultado.frentes.map((f) => ({
        tipoFrente: f.tipoFrente,
        estado: f.estado,
      })),
    });

    return resultado;
  }

  /**
   * Actualiza datos de cabecera de un listado.
   * Regla de negocio fundamental: Únicamente permitido cuando el listado está en estado PENDIENTE.
   * Si está en SEPARADO o posterior, el usuario debe retroceder primero a PENDIENTE.
   */
  async updateListado(id: number, data: UpdateListadoInput, usuarioId: number) {
    const scope = await scopeService.resolveUserScope(usuarioId);
    const scopeWhere = scopeService.buildScopeWhere(scope);

    const actualizado = await prisma.$transaction(async (tx) => {
      const listado = await tx.listadoMaterial.findFirst({
        where: {
          id,
          ...scopeWhere,
          departamento: { estado: "ACTIVO" },
          lineaProduccion: { estado: "ACTIVO" },
        },
        include: {
          lineaProduccion: { select: { id: true, codigo: true, nombre: true, departamentoId: true } },
          departamento: { select: { id: true, codigo: true, nombre: true } },
        },
      });

      if (!listado) {
        throw new NotFoundError(`Listado con ID ${id} no encontrado o fuera de su alcance autorizado`);
      }

      // Validar si puede ser editado:
      // Para usuarios normales, solo en PENDIENTE.
      // Para ADMIN / SUPER_ADMIN, se permite editar salvo que ya esté CANCELADO, DESCONTADO o con todos los frentes completos en ENTREGADO/DESCONTADO.
      const frentes = await tx.listadoSurtidoFrente.findMany({ where: { listadoMaterialId: id } });
      const todosDescontados = frentes.length > 0 && frentes.every(
        (f) => f.estado === "DESCONTADO"
      );

      if (scope.rolCodigo === "SUPER_ADMIN" || scope.rolCodigo === "ADMIN") {
        if (listado.estado === "CANCELADO" || listado.estado === "DESCONTADO" || todosDescontados) {
          throw new ConflictError(
            `No se pueden modificar los datos de un listado ${listado.estado === "CANCELADO" ? "cancelado" : "cuyos materiales ya fueron descontados en el sistema en su totalidad"}.`
          );
        }
      } else {
        if (listado.estado !== "PENDIENTE") {
          throw new ConflictError(
            `No se pueden modificar los datos de un listado en estado ${listado.estado}. Para corregirlo, debe retroceder primero a PENDIENTE.`,
          );
        }
      }

      let nuevaLineaId = listado.lineaProduccionId;
      let nuevoDepartamentoId = listado.departamentoId;

      // Si cambia la línea de producción
      if (data.lineaProduccionId && data.lineaProduccionId !== listado.lineaProduccionId) {
        const nuevaLinea = await tx.lineaProduccion.findUnique({
          where: { id: data.lineaProduccionId },
          include: { departamento: true },
        });

        if (!nuevaLinea || nuevaLinea.estado !== "ACTIVO" || nuevaLinea.departamento.estado !== "ACTIVO") {
          throw new BadRequestError(`La línea de producción ID ${data.lineaProduccionId} no existe o no está activa`);
        }

        // Validar alcance sobre la nueva línea / departamento
        scopeService.validateDestinationScope(scope, {
          departamentoId: nuevaLinea.departamentoId,
          lineaProduccionId: nuevaLinea.id,
        });

        nuevaLineaId = nuevaLinea.id;
        nuevoDepartamentoId = nuevaLinea.departamentoId;
      }

      // Si cambia el número de listado, validar unicidad
      if (data.numeroListado && data.numeroListado !== listado.numeroListado) {
        const existente = await tx.listadoMaterial.findUnique({
          where: { numeroListado: data.numeroListado },
        });

        if (existente && existente.id !== id) {
          throw new ConflictError(`Ya existe un listado con el número '${data.numeroListado}'`);
        }
      }

      const cambios: string[] = [];
      const updateData: Prisma.ListadoMaterialUpdateInput = {};

      if (data.numeroListado && data.numeroListado !== listado.numeroListado) {
        cambios.push(`numeroListado: '${listado.numeroListado}' -> '${data.numeroListado}'`);
        updateData.numeroListado = data.numeroListado;
      }

      if (data.fechaRequerida) {
        const fechaReqStr = listado.fechaRequerida.toISOString().slice(0, 10);
        if (fechaReqStr !== data.fechaRequerida) {
          cambios.push(`fechaRequerida: '${fechaReqStr}' -> '${data.fechaRequerida}'`);
          updateData.fechaRequerida = new Date(data.fechaRequerida);
        }
      }

      if (data.lineaProduccionId && data.lineaProduccionId !== listado.lineaProduccionId) {
        cambios.push(`lineaProduccion: '${listado.lineaProduccion.codigo}' -> línea ID ${nuevaLineaId}`);
        updateData.lineaProduccion = {
          connect: {
            unique_linea_departamento: {
              id: nuevaLineaId,
              departamentoId: nuevoDepartamentoId,
            },
          },
        };
        updateData.departamento = {
          connect: { id: nuevoDepartamentoId },
        };
      }

      if (Object.keys(updateData).length > 0) {
        if (data.lineaProduccionId && data.lineaProduccionId !== listado.lineaProduccionId) {
          const nuevaLinea = await tx.lineaProduccion.findUniqueOrThrow({ where: { id: nuevaLineaId } });
          const frentesData: Prisma.ListadoSurtidoFrenteCreateWithoutListadoInput[] = [
            { tipoFrente: "DIRECTOS", estado: "PENDIENTE" },
            { tipoFrente: "INDIRECTOS", estado: "PENDIENTE" }
          ];
          if (nuevaLinea.codigo === "BOLSAS") {
            frentesData.push({ tipoFrente: "BOLSAS", estado: "PENDIENTE" });
          }
          await tx.listadoSurtidoFrente.deleteMany({ where: { listadoMaterialId: id } });
          await tx.listadoMaterial.update({
            where: { id },
            data: { ...updateData, frentes: { create: frentesData } },
          });
        } else {
          await tx.listadoMaterial.update({
            where: { id },
            data: updateData,
          });
        }

        await tx.registroAuditoria.create({
          data: {
            usuarioId,
            accion: "LISTADO_MODIFICADO",
            entidad: "listados_material",
            entidadId: id,
            detalle: `Listado modificado: ${cambios.join("; ")}`,
          },
        });
      }

      return tx.listadoMaterial.findUniqueOrThrow({
        where: { id },
        include: {
          lineaProduccion: { select: { id: true, codigo: true, nombre: true } },
          departamento: { select: { id: true, codigo: true, nombre: true } },
          creadoPorUsuario: { select: { id: true, usuario: true, nombre: true } },
          frentes: true,
        },
      });
    });

    // Publicación post-commit
    listadosEventPublisher.publish({
      id: crypto.randomUUID(),
      tipo: "LISTADO_ACTUALIZADO",
      timestamp: new Date().toISOString(),
      listadoId: actualizado.id,
      numeroListado: actualizado.numeroListado,
      departamentoId: actualizado.departamentoId,
      lineaProduccionId: actualizado.lineaProduccionId,
      lineaCodigo: actualizado.lineaProduccion.codigo,
      estadoGlobal: actualizado.estado,
      frentes: actualizado.frentes.map((f) => ({
        tipoFrente: f.tipoFrente,
        estado: f.estado,
      })),
    });

    return actualizado;
  }
}

export const listadosService = new ListadosService();
