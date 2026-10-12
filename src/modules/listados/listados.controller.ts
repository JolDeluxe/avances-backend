import type { Request, Response, NextFunction } from "express";
import { listadosService, listadosQueryService, listadosLifecycleService } from "./services";
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
