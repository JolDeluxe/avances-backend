import type { Request, Response, NextFunction } from "express";
import { sessionService } from "../services/session.service";
import { sendSuccess } from "../../../utils/response";
import { env } from "../../../config/env";

export class SessionController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await sessionService.login(req.body, ip, userAgent);

      // Establecer Cookie HttpOnly con la duración de 30 días
      res.cookie(env.SESSION_COOKIE_NAME, result.refreshToken, {
        httpOnly: env.SESSION_COOKIE_HTTP_ONLY,
        secure: env.SESSION_COOKIE_SECURE,
        sameSite: env.SESSION_COOKIE_SAME_SITE,
        maxAge: env.SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
        path: "/",
      });

      // Se devuelve el usuario y el access token (nunca el refresh token ni passwords en el JSON)
      sendSuccess(
        res,
        {
          usuario: result.usuario,
          accessToken: result.accessToken,
        },
        "Inicio de sesión exitoso",
      );
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Extraer cookie de sesión
      const refreshToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.[env.SESSION_COOKIE_NAME];
      const result = await sessionService.refresh(refreshToken);

      sendSuccess(res, result, "Token renovado exitosamente");
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.[env.SESSION_COOKIE_NAME];
      const result = await sessionService.logout(refreshToken);

      // Limpiar cookie HttpOnly
      res.clearCookie(env.SESSION_COOKIE_NAME, {
        httpOnly: env.SESSION_COOKIE_HTTP_ONLY,
        secure: env.SESSION_COOKIE_SECURE,
        sameSite: env.SESSION_COOKIE_SAME_SITE,
        path: "/",
      });

      sendSuccess(res, result, "Cierre de sesión exitoso");
    } catch (error) {
      next(error);
    }
  }

  async getUsuariosLogin(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuarios = await sessionService.getUsuariosActivosPublicos();
      sendSuccess(res, usuarios, "Usuarios disponibles para inicio de sesión");
    } catch (error) {
      next(error);
    }
  }
}

export const sessionController = new SessionController();
