import { prisma } from "../../../config/database";

/**
 * Servicio encargado de la resolución y cálculo de permisos efectivos del sistema.
 * 
 * Regla de negocio:
 * (Permisos Base del Rol Activo ∪ Excepciones CONCEDER Activas) − Excepciones DENEGAR Activas
 * 
 * Regla de Oro:
 * SUPER_ADMIN conserva acceso incondicional a todos los permisos activos del sistema
 * (inmune a bloqueos por DENEGAR accidentales).
 */
export class PermissionService {
  async calcularPermisosEfectivos(usuarioId: number): Promise<string[]> {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        rol: {
          include: {
            permisos: {
              where: { estado: "ACTIVO" },
              include: {
                permiso: true,
              },
            },
          },
        },
        excepcionesPermiso: {
          where: { estado: "ACTIVO" },
          include: {
            permiso: true,
          },
        },
      },
    });

    if (!usuario || usuario.estado !== "ACTIVO") {
      return [];
    }

    // Si el usuario es SUPER_ADMIN o ADMIN, retorna todos los permisos activos del catálogo
    if ((usuario.rol.codigo === "SUPER_ADMIN" || usuario.rol.codigo === "ADMIN") && usuario.rol.estado === "ACTIVO") {
      const todosLosPermisos = await prisma.permiso.findMany({
        where: { estado: "ACTIVO" },
        select: { codigo: true },
      });
      return todosLosPermisos.map((p: { codigo: string }) => p.codigo);
    }

    // 1. Permisos base del rol activo
    const permisosBase = new Set<string>();
    if (usuario.rol.estado === "ACTIVO") {
      for (const rp of usuario.rol.permisos) {
        if (rp.estado === "ACTIVO" && rp.permiso.estado === "ACTIVO") {
          permisosBase.add(rp.permiso.codigo);
        }
      }
    }

    // 2. Aplicar excepciones individuales activas
    for (const ex of usuario.excepcionesPermiso) {
      if (ex.estado === "ACTIVO" && ex.permiso.estado === "ACTIVO") {
        if (ex.accion === "CONCEDER") {
          permisosBase.add(ex.permiso.codigo);
        } else if (ex.accion === "DENEGAR") {
          permisosBase.delete(ex.permiso.codigo);
        }
      }
    }

    return Array.from(permisosBase);
  }
}

export const permissionService = new PermissionService();

// Exportación nombrada para compatibilidad directa
export const calcularPermisosEfectivos = (usuarioId: number): Promise<string[]> =>
  permissionService.calcularPermisosEfectivos(usuarioId);
