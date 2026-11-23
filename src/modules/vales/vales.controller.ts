import type { Request, Response, NextFunction } from "express";
import {
  valesCatalogService,
  valesLifecycleService,
  valesQueryService,
  valesScopeService,
  valesService,
} from "./services";
import { valesEventPublisher } from "./events";
import { sessionService } from "../auth/services/session.service";
import { permissionService } from "../auth/services/permission.service";
import { PERMISOS } from "../../config/permissions";
import { logger } from "../../utils/logger";
import { sendCreated, sendSuccess } from "../../utils/response";
import type {
  BatchOperarValesInput,
  CancelarValeInput,
  CreateValeInput,
  DescontarValeInput,
  EntregarValeInput,
  FilterValesQuery,
  RetrocederValeInput,
  SepararValeInput,
  UpdateValeInput,
} from "./vales.schema";

export class ValesController {
  /**
   * Canal Server-Sent Events (SSE) en tiempo real exclusivo del módulo de Vales.
   * - Aísla estrictamente los eventos por departamentoId organizacional (salvo SUPER_ADMIN).
   * - Aplica el alcance operativo acumulativo (áreas + departamentos individuales, incluyendo B7 por ValeMaterial.area).
   * - Antes de distribuir cualquier evento comprueba la vigencia del usuario, su versionPermisos,
   *   el permiso vale:ver y su alcance actualizado en tiempo real, cerrando inmediatamente la conexión
   *   si perdió autorización (sin esperar al heartbeat de 25 segundos).
   */
  async streamVales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuarioId = req.user!.usuarioId;
      const initialVersionPermisos = req.user!.versionPermisos ?? 1;

      await valesScopeService.resolveScope(usuarioId);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(
        `event: conectado\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`,
      );

      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
      let isClosed = false;

      const closeStream = (sendObsoleteEvent: boolean) => {
        if (isClosed) return;
        isClosed = true;
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        unsubscribe();
        if (!res.writableEnded) {
          if (sendObsoleteEvent) {
            res.write(`event: permisos_obsoletos\ndata: {}\n\n`);
          }
          res.end();
        }
      };

      const unsubscribe = valesEventPublisher.subscribe((evento) => {
        if (isClosed || res.writableEnded) return;

        void (async () => {
          try {
            // 1. Verificar vigencia del usuario y versión de permisos antes de distribuir el evento
            const activeUser = await sessionService.validateActiveUser(usuarioId);
            if (isClosed || res.writableEnded) return;

            if (activeUser.versionPermisos > initialVersionPermisos) {
              closeStream(true);
              return;
            }

            // 2. Verificar que conserva el permiso efectivo vale:ver y resolver su alcance actual
            const [permisosActuales, currentScope] = await Promise.all([
              permissionService.calcularPermisosEfectivos(usuarioId),
              valesScopeService.resolveScope(usuarioId),
            ]);

            if (isClosed || res.writableEnded) return;

            if (!permisosActuales.includes(PERMISOS.VALE_VER)) {
              closeStream(true);
              return;
            }

            // 3. Evaluar aislamiento organizacional y alcance operativo acumulativo (individual y por lote)
            const eventoFiltrado = valesScopeService.filterEventForScope(currentScope, evento);
            if (!eventoFiltrado) {
              return;
            }

            if (!isClosed && !res.writableEnded) {
              res.write(`event: ${eventoFiltrado.tipo}\ndata: ${JSON.stringify(eventoFiltrado)}\n\n`);
            }
          } catch {
            closeStream(false);
          }
        })();
      });

      heartbeatInterval = setInterval(async () => {
        if (isClosed || res.writableEnded) {
          closeStream(false);
          return;
        }

        try {
          const activeUser = await sessionService.validateActiveUser(usuarioId);
          if (activeUser.versionPermisos > initialVersionPermisos) {
            closeStream(true);
            return;
          }

          const permisosActuales = await permissionService.calcularPermisosEfectivos(usuarioId);
          if (!permisosActuales.includes(PERMISOS.VALE_VER)) {
            closeStream(true);
            return;
          }

          if (!isClosed && !res.writableEnded) {
            res.write(`: ping ${Date.now()}\n\n`);
          }
        } catch {
          closeStream(false);
        }
      }, 25000);

      req.on("close", () => {
        closeStream(false);
        logger.debug({ usuarioId }, "Conexión SSE de vales finalizada por el cliente");
      });
    } catch (error) {
      next(error);
    }
  }

  async getCatalogos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const departamentoIdQuery = req.query.departamentoId
        ? Number(req.query.departamentoId)
        : undefined;
      const catalogos = await valesCatalogService.getCatalogos(
        req.user!.usuarioId,
        departamentoIdQuery,
      );
      sendSuccess(res, catalogos, "Catálogos de vales obtenidos exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async getAuditoriaCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuarioId = req.user!.usuarioId;
      const permisos = req.user!.permisos ?? [];
      const count = await valesQueryService.getAuditoriaCount(usuarioId, permisos);
      sendSuccess(res, { count });
    } catch (error) {
      next(error);
    }
  }

  async getVales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filtros = req.query as unknown as FilterValesQuery;
      const resultado = await valesQueryService.getVales(filtros, req.user!.usuarioId);
      sendSuccess(res, resultado, "Vales obtenidos exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async getValeById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const vale = await valesQueryService.getValeById(id, req.user!.usuarioId);
      sendSuccess(res, vale, "Detalle del vale obtenido exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async createVale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body as CreateValeInput;
      const vale = await valesService.createVale(data, req.user!.usuarioId);
      sendCreated(res, vale, "Vale registrado exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async updateVale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = req.body as UpdateValeInput;
      const vale = await valesService.updateVale(id, data, req.user!.usuarioId);
      sendSuccess(res, vale, "Vale actualizado exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async separarVale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const input = req.body as SepararValeInput;
      const vale = await valesLifecycleService.separar(
        id,
        input,
        req.user!.usuarioId,
        req.user!.permisos,
      );
      const mensaje = input.entregarTambien
        ? "Vale separado y entregado a producción exitosamente"
        : "Vale separado en almacén exitosamente";
      sendSuccess(res, vale, mensaje);
    } catch (error) {
      next(error);
    }
  }

  async entregarVale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const input = req.body as EntregarValeInput;
      const vale = await valesLifecycleService.entregar(
        id,
        input,
        req.user!.usuarioId,
        req.user!.permisos,
      );
      sendSuccess(res, vale, "Vale entregado a producción exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async descontarVale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const input = req.body as DescontarValeInput;
      const vale = await valesLifecycleService.descontar(
        id,
        input,
        req.user!.usuarioId,
        req.user!.permisos,
      );
      sendSuccess(res, vale, "Confirmación de descuento registrada exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async retrocederVale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const input = req.body as RetrocederValeInput;
      const vale = await valesLifecycleService.retroceder(
        id,
        input,
        req.user!.usuarioId,
        req.user!.permisos,
      );
      sendSuccess(res, vale, "Estado del vale retrocedido exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async cancelarVale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const input = req.body as CancelarValeInput;
      const vale = await valesLifecycleService.cancelar(
        id,
        input,
        req.user!.usuarioId,
        req.user!.permisos,
      );
      sendSuccess(res, vale, "Vale cancelado exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async batchOperarVales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as BatchOperarValesInput;
      const resultado = await valesLifecycleService.batchOperar(
        input,
        req.user!.usuarioId,
        req.user!.permisos,
      );
      sendSuccess(
        res,
        resultado,
        `Operación en lote (${input.accion}) completada exitosamente sobre ${resultado.procesados} vales`,
      );
    } catch (error) {
      next(error);
    }
  }
}

export const valesController = new ValesController();
