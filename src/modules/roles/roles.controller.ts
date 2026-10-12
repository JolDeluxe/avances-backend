import type { Request, Response } from "express";
import { rolesService } from "./roles.service";
import { sendSuccess } from "../../utils/response";

export class RolesController {
  async getRoles(_req: Request, res: Response): Promise<Response> {
    const roles = await rolesService.getRoles();
    return sendSuccess(res, roles, "Roles obtenidos exitosamente");
  }

  async getRoleById(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const rol = await rolesService.getRoleById(id);
    return sendSuccess(res, rol, "Detalle del rol obtenido exitosamente");
  }

  async getAllPermissions(_req: Request, res: Response): Promise<Response> {
    const permisos = await rolesService.getAllPermissions();
    return sendSuccess(res, permisos, "Catálogo de permisos obtenido exitosamente");
  }

  async updateRolePermissions(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const rolActualizado = await rolesService.updateRolePermissions(
      id,
      req.body.permisoIds,
      req.user?.usuarioId,
    );
    return sendSuccess(res, rolActualizado, "Permisos del rol actualizados exitosamente");
  }
}

export const rolesController = new RolesController();
