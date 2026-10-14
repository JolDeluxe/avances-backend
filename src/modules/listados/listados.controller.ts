import type { Request, Response, NextFunction } from "express";
import { listadosService, listadosQueryService, listadosLifecycleService } from "./services";
import { listadosEventPublisher } from "./events";
import { scopeService } from "../auth/services/scope.service";
import { sessionService } from "../auth/services/session.service";
import { logger } from "../../utils/logger";
import { sendSuccess, sendCreated } from "../../utils/response";
import type { TipoFrenteMaterial } from "@prisma/client";
import type {
  ListListadosQuery,
  CreateListadoInput,
  UpdateListadoInput,
  MotivoTransicionInput,
  MotivoOpcionalInput,
} from "./listados.schema";

export class ListadosController {
  /**
   * Endpoint Server-Sent Events (SSE) para sincronización de listados en tiempo real.
   *
   * Requisitos y características implementadas:
   * 1. Autenticado mediante JWT Bearer token existente (req.user).
   * 2. Resuelve el UserScope del usuario al conectarse para no enviar eventos fuera de su alcance.
   * 3. Configura encabezados SSE evitando compresión/buffering de proxies (X-Accel-Buffering: no).
   * 4. Envía heartbeats periódicos cada 25 segundos para mantener activo el socket.
   * 5. Verifica periódicamente la validez del usuario (corte inmediato si se inactiva o cambian permisos).
   * 6. Limpia listeners y temporizadores en desconexión (req.on('close')).
   */
  async streamListados(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuarioId = req.user!.usuarioId;
      const initialVersionPermisos = req.user!.versionPermisos ?? 1;

      // Resolver alcance operativo real del usuario
      const scope = await scopeService.resolveUserScope(usuarioId);

      // Configurar encabezados HTTP SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Enviar mensaje de bienvenida / conexión establecida
      res.write(`event: conectado\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

      // Suscribir al bus de eventos
      const unsubscribe = listadosEventPublisher.subscribe((evento) => {
        if (res.writableEnded) return;

        // Filtrado por alcance departamental del suscriptor:
        // 1. Si no es global, debe coincidir con el departamento del usuario
        if (!scope.esGlobal && evento.departamentoId !== scope.departamentoId) {
          return;
        }

        // NOTA: Para permitir que las pantallas de visualización en vivo (Proyección, Monitores, etc.)
        // y los usuarios con permiso de ver listados puedan observar el avance completo en tiempo real
        // de todas las líneas y frentes (DIR, IND, BOL), no se descartan eventos de otras líneas ni frentes.

        // Transmitir evento en formato SSE estándar
        res.write(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`);
      });

      // Heartbeat cada 25s para mantener vivo el socket y verificar vigencia del usuario
      const heartbeatInterval = setInterval(async () => {
        if (res.writableEnded) {
          clearInterval(heartbeatInterval);
          return;
        }

        try {
          // Verificar si el usuario sigue activo o si sus permisos cambiaron
          const activeUser = await sessionService.validateActiveUser(usuarioId);
          if (activeUser.versionPermisos > initialVersionPermisos) {
            // Permisos revocados o modificados: cerrar conexión para forzar reautenticación
            res.write(`event: permisos_obsoletos\ndata: {}\n\n`);
            res.end();
            return;
          }

          // Enviar ping estándar de SSE
          res.write(`: ping ${Date.now()}\n\n`);
        } catch {
          // Si el usuario fue inactivado o eliminado, cortar conexión
          res.end();
        }
      }, 25000);

      // Limpieza garantizada al desconectar el cliente
      req.on("close", () => {
        clearInterval(heartbeatInterval);
        unsubscribe();
        logger.debug({ usuarioId }, "Conexión SSE de listados finalizada por el cliente");
      });
    } catch (error) {
      next(error);
    }
  }

  async getListados(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filtros = req.query as unknown as ListListadosQuery;
      const listados = await listadosQueryService.getListados(req.user!.usuarioId, filtros);
      sendSuccess(res, listados, "Listados obtenidos exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async getListadoById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const listado = await listadosQueryService.getListadoById(id, req.user!.usuarioId);
      sendSuccess(res, listado, "Listado obtenido exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async getAnios(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const anios = await listadosQueryService.getAniosDisponibles(req.user!.usuarioId);
      sendSuccess(res, anios, "Años disponibles obtenidos exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async createListado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body as CreateListadoInput;
      const listado = await listadosService.createListado(data, req.user!.usuarioId);
      sendCreated(res, listado, "Listado creado exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async updateListado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = req.body as UpdateListadoInput;
      const listado = await listadosService.updateListado(id, data, req.user!.usuarioId);
      sendSuccess(res, listado, "Listado actualizado exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async separarListado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const body = req.body as MotivoOpcionalInput | undefined;
      const listado = await listadosLifecycleService.separar(id, req.user!.usuarioId, body?.tipoFrente as TipoFrenteMaterial, body?.motivo);
      sendSuccess(res, listado, "Listado separado exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async entregarListado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const body = req.body as MotivoOpcionalInput | undefined;
      const listado = await listadosLifecycleService.entregar(id, req.user!.usuarioId, body?.tipoFrente as TipoFrenteMaterial, body?.motivo);
      sendSuccess(res, listado, "Listado entregado a producción exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async retrocederListado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const { motivo, tipoFrente } = req.body as MotivoTransicionInput;
      const listado = await listadosLifecycleService.retroceder(id, req.user!.usuarioId, tipoFrente as TipoFrenteMaterial, motivo);
      sendSuccess(res, listado, "Listado retrocedido exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async cancelarListado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const { motivo } = req.body as MotivoTransicionInput;
      const listado = await listadosLifecycleService.cancelar(id, req.user!.usuarioId, motivo);
      sendSuccess(res, listado, "Listado cancelado exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async descontarListado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const body = req.body as MotivoOpcionalInput | undefined;
      const listado = await listadosLifecycleService.descontar(id, req.user!.usuarioId, body?.tipoFrente as TipoFrenteMaterial, body?.motivo);
      sendSuccess(res, listado, "Listado descontado exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async batchOperar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ids, accion, tipoFrente, motivo } = req.body as {
        ids: number[];
        accion: "separar" | "entregar" | "descontar";
        tipoFrente?: TipoFrenteMaterial;
        motivo?: string;
      };

      // Validación de permisos por acción
      const userPermisos = req.user!.permisos || [];
      if (accion === "separar" && !userPermisos.includes("listado:separar")) {
        res.status(403).json({ success: false, message: "No tiene permiso para separar listados" });
        return;
      }
      if (accion === "entregar" && !userPermisos.includes("listado:entregar")) {
        res.status(403).json({ success: false, message: "No tiene permiso para entregar listados" });
        return;
      }
      if (accion === "descontar" && !userPermisos.includes("listado:descontar")) {
        res.status(403).json({ success: false, message: "No tiene permiso para descontar listados" });
        return;
      }

      const resultado = await listadosLifecycleService.batchOperar(
        ids,
        accion,
        req.user!.usuarioId,
        tipoFrente,
        motivo,
      );

      sendSuccess(res, resultado, `Operación masiva '${accion}' completada`);
    } catch (error) {
      next(error);
    }
  }
}

export const listadosController = new ListadosController();
