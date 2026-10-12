import type { Request, Response, NextFunction } from "express";
import { passwordService } from "../services/password.service";
import { sendSuccess } from "../../../utils/response";

export class PasswordController {
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuarioId = req.user!.usuarioId;
      const result = await passwordService.changePassword(usuarioId, req.body);
      sendSuccess(res, result, "Contraseña actualizada exitosamente");
    } catch (error) {
      next(error);
    }
  }
}

export const passwordController = new PasswordController();
