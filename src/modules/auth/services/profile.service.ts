import { prisma } from "../../../config/database";
import { NotFoundError } from "../../../utils/errors";
import { permissionService } from "./permission.service";
import type { UpdateProfileInput } from "../auth.schema";

export class ProfileService {
  async getProfile(usuarioId: number) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        usuario: true,
        nombre: true,
        estado: true,
        tipoSurtidoAlmacen: true,
        tipoMaterialAuditor: true,
        rol: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
          },
        },
        departamento: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
          },
        },
        lineasAsignadas: {
          where: { estado: "ACTIVO" },
          include: {
            lineaProduccion: {
              select: { id: true, codigo: true, nombre: true, area: true },
            },
          },
        },
        fechaCreacion: true,
        fechaActualizacion: true,
      },
    });

    if (!usuario || usuario.estado !== "ACTIVO") {
      throw new NotFoundError("Usuario no encontrado o inactivo");
    }

    const permisos = await permissionService.calcularPermisosEfectivos(usuario.id);

    return {
      ...usuario,
      lineasAsignadas: usuario.lineasAsignadas.map((l) => l.lineaProduccion),
      permisos,
    };
  }

  async updateProfile(usuarioId: number, input: UpdateProfileInput) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
    });

    if (!usuario || usuario.estado !== "ACTIVO") {
      throw new NotFoundError("Usuario no encontrado o inactivo");
    }

    return prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        ...(input.name && { nombre: input.name }),
      },
      select: {
        id: true,
        usuario: true,
        nombre: true,
        estado: true,
        fechaActualizacion: true,
      },
    });
  }
}

export const profileService = new ProfileService();
