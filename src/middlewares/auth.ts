import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";
import { securityService, type TokenPayload } from "../modules/auth/services/security.service";
import { sessionService } from "../modules/auth/services/session.service";
import type { PermisoCodigo } from "../config/permissions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Token de acceso no proporcionado o formato inválido");
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      throw new UnauthorizedError("Token de acceso no proporcionado");
    }

    const decoded = securityService.verifyAccessToken(token);
    if (!decoded) {
      throw new UnauthorizedError("Token de acceso inválido o expirado");
    }

    // Validar estado actual del usuario mediante la capa de servicio (corte inmediato de acceso)
    const activeUser = await sessionService.validateActiveUser(decoded.usuarioId);

    // Renovación inmediata de permisos sin desconectar al usuario
    if (decoded.versionPermisos !== undefined && decoded.versionPermisos < activeUser.versionPermisos) {
      throw new UnauthorizedError("PERMISOS_OBSOLETOS");
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

export const requirePermission = (permisoRequerido: PermisoCodigo) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError("Usuario no autenticado");
    }

    if (!req.user.permisos || !req.user.permisos.includes(permisoRequerido)) {
      throw new ForbiddenError(`Acceso denegado: se requiere el permiso '${permisoRequerido}'`);
    }

    next();
  };
};
