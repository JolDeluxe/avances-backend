import { prisma } from "../../../config/database";
import { NotFoundError, UnauthorizedError } from "../../../utils/errors";
import { securityService } from "./security.service";
import type { ChangePasswordInput } from "../auth.schema";

export class PasswordService {
  async changePassword(usuarioId: number, input: ChangePasswordInput) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
    });

    if (!usuario || usuario.estado !== "ACTIVO") {
      throw new NotFoundError("Usuario no encontrado o inactivo");
    }

    const isMatch = securityService.verifyPassword(input.currentPassword, usuario.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError("La contraseña actual es incorrecta");
    }

    const newHash = securityService.hashPassword(input.newPassword);
    const newEncrypted = securityService.encryptPassword(input.newPassword);

    await prisma.$transaction(async (tx) => {
      // 1. Actualizar hash de contraseña y contraseña cifrada reversible
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          passwordHash: newHash,
          passwordEncrypted: newEncrypted,
        },
      });

      // 2. Revocar sesiones activas existentes para invalidar tokens previos
      await tx.sesion.updateMany({
        where: { usuarioId, estado: "ACTIVO" },
        data: {
          estado: "INACTIVO",
          fechaRevocacion: new Date(),
        },
      });

      // 3. Registrar auditoría transversal
      await tx.registroAuditoria.create({
        data: {
          usuarioId,
          accion: "USUARIO_PASSWORD_MODIFICADO",
          entidad: "usuarios",
          entidadId: usuarioId,
          detalle: `Contraseña modificada por el propio usuario: ${usuario.usuario}`,
        },
      });
    });

    return { message: "Contraseña actualizada exitosamente" };
  }
}

export const passwordService = new PasswordService();
