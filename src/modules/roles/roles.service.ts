import { prisma } from "../../config/database";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../utils/errors";
import { scopeService } from "../auth/services/scope.service";

export class RolesService {
  async getRoles() {
    const roles = await prisma.rol.findMany({
      where: { estado: "ACTIVO" },
      include: {
        permisos: {
          where: { estado: "ACTIVO" },
          include: {
            permiso: {
              select: { id: true, codigo: true, modulo: true, descripcion: true },
            },
          },
        },
        _count: {
          select: {
            usuarios: { where: { estado: "ACTIVO" } },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    const ROLE_PRIORITY: Record<string, number> = {
      SUPER_ADMIN: 1,
      ADMIN: 2,
      REGISTRADOR: 3,
      AUDITOR: 4,
      ALMACENISTA: 5,
    };

    return roles
      .map((r) => ({
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        estado: r.estado,
        totalUsuariosActivos: r._count.usuarios,
        permisos: r.permisos.map((rp) => rp.permiso),
      }))
      .sort((a, b) => {
        const pA = ROLE_PRIORITY[a.codigo] ?? 99;
        const pB = ROLE_PRIORITY[b.codigo] ?? 99;
        if (pA !== pB) return pA - pB;
        return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      });
  }

  async getRoleById(id: number, soloActivos = true) {
    const rol = await prisma.rol.findFirst({
      where: {
        id,
        ...(soloActivos && { estado: "ACTIVO" }),
      },
      include: {
        permisos: {
          where: { estado: "ACTIVO" },
          include: {
            permiso: {
              select: { id: true, codigo: true, modulo: true, descripcion: true },
            },
          },
        },
        _count: {
          select: {
            usuarios: { where: { estado: "ACTIVO" } },
          },
        },
      },
    });

    if (!rol) {
      throw new NotFoundError(`Rol con ID ${id} no encontrado`);
    }

    return {
      id: rol.id,
      codigo: rol.codigo,
      nombre: rol.nombre,
      estado: rol.estado,
      totalUsuariosActivos: rol._count.usuarios,
      permisos: rol.permisos.map((rp) => rp.permiso),
    };
  }

  async getAllPermissions() {
    return prisma.permiso.findMany({
      where: { estado: "ACTIVO" },
      select: {
        id: true,
        codigo: true,
        modulo: true,
        descripcion: true,
      },
      orderBy: [{ modulo: "asc" }, { codigo: "asc" }],
    });
  }

  async updateRolePermissions(roleId: number, permisoIds: number[], actorId?: number) {
    // Blindaje Jerárquico: Solo SUPER_ADMIN puede modificar la matriz de roles y permisos
    if (actorId) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal) {
        throw new ForbiddenError("Operación denegada: Solo SUPER_ADMIN puede modificar la matriz de roles y permisos");
      }
    }

    const rol = await prisma.rol.findUnique({
      where: { id: roleId },
    });

    if (!rol || rol.estado !== "ACTIVO") {
      throw new NotFoundError(`Rol con ID ${roleId} no encontrado o inactivo`);
    }

    // Protección de SUPER_ADMIN: No se pueden restringir los permisos base de SUPER_ADMIN
    if (rol.codigo === "SUPER_ADMIN") {
      throw new BadRequestError(
        "Operación no permitida: Los permisos del rol SUPER_ADMIN son totales e inmutables",
      );
    }

    // Validar que todos los permisos solicitados existan y estén activos
    if (permisoIds.length > 0) {
      const permisosEncontrados = await prisma.permiso.findMany({
        where: {
          id: { in: permisoIds },
          estado: "ACTIVO",
        },
      });

      if (permisosEncontrados.length !== permisoIds.length) {
        throw new BadRequestError("Uno o más permisos especificados no existen o están inactivos");
      }
    }

    // Actualización transaccional de RolPermiso
    await prisma.$transaction(async (tx) => {
      // Eliminar asignaciones previas
      await tx.rolPermiso.deleteMany({
        where: { rolId: roleId },
      });

      // Crear nuevas asignaciones
      if (permisoIds.length > 0) {
        await tx.rolPermiso.createMany({
          data: permisoIds.map((permisoId) => ({
            rolId: roleId,
            permisoId,
            estado: "ACTIVO",
          })),
        });
      }

      // Incrementar versionPermisos para todos los usuarios activos de este rol
      await tx.usuario.updateMany({
        where: { rolId: roleId, estado: "ACTIVO" },
        data: { versionPermisos: { increment: 1 } },
      });

      // Registro de auditoría
      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId ?? null,
          accion: "ROL_PERMISOS_ACTUALIZADOS",
          entidad: "roles",
          entidadId: roleId,
          detalle: `Matriz de permisos actualizada para el rol ${rol.codigo} (${permisoIds.length} permisos asignados)`,
        },
      });
    });

    return this.getRoleById(roleId);
  }
}

export const rolesService = new RolesService();
