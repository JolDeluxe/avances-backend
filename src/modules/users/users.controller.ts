import type { Request, Response } from "express";
import { usersService } from "./users.service";
import { sendSuccess, sendCreated } from "../../utils/response";
import type { FilterUsersQuery } from "./users.schema";

export class UsersController {
  async getUsers(req: Request, res: Response): Promise<Response> {
    const filtros = req.query as unknown as FilterUsersQuery;
    const resultado = await usersService.getUsers(filtros, req.user?.usuarioId);
    return sendSuccess(res, resultado, "Usuarios obtenidos exitosamente");
  }

  async getUserById(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const usuario = await usersService.getUserById(id, req.user?.usuarioId);
    return sendSuccess(res, usuario, "Detalle de usuario obtenido exitosamente");
  }

  async createUser(req: Request, res: Response): Promise<Response> {
    const usuario = await usersService.createUser(req.body, req.user?.usuarioId);
    return sendCreated(res, usuario, "Usuario creado exitosamente");
  }

  async updateUser(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const usuario = await usersService.updateUser(id, req.body, req.user?.usuarioId);
    return sendSuccess(res, usuario, "Usuario actualizado exitosamente");
  }

  async deleteUser(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const resultado = await usersService.deleteUser(id, req.user?.usuarioId);
    return sendSuccess(res, resultado, "Usuario inactivado exitosamente");
  }

  async reactivateUser(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const usuario = await usersService.reactivateUser(id, req.user?.usuarioId);
    return sendSuccess(res, usuario, "Usuario reactivado exitosamente");
  }

  async resetPassword(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const resultado = await usersService.resetUserPassword(id, req.body, req.user?.usuarioId);
    return sendSuccess(res, resultado, "Contraseña restablecida exitosamente");
  }

  async getRevealedPassword(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const resultado = await usersService.revealUserPassword(id, req.user?.usuarioId);
    return sendSuccess(res, resultado, "Contraseña revelada exitosamente");
  }

  async getCatalogs(_req: Request, res: Response): Promise<Response> {
    const catalogos = await usersService.getCatalogs();
    return sendSuccess(res, catalogos, "Catálogos para gestión de usuarios obtenidos exitosamente");
  }
}

export const usersController = new UsersController();
