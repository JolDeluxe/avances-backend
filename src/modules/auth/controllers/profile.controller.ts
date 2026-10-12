import type { Request, Response, NextFunction } from "express";
import { profileService } from "../services/profile.service";
import { sendSuccess } from "../../../utils/response";

export class ProfileController {
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuarioId = req.user!.usuarioId;
      const result = await profileService.getProfile(usuarioId);
      sendSuccess(res, result, "Perfil obtenido");
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuarioId = req.user!.usuarioId;
      const result = await profileService.updateProfile(usuarioId, req.body);
      sendSuccess(res, result, "Perfil actualizado exitosamente");
    } catch (error) {
      next(error);
    }
  }
}

export const profileController = new ProfileController();
