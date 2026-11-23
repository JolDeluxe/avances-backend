import { prisma } from "../src/config/database";
import { PERMISOS, PERMISOS_METADATA, type PermisoCodigo } from "../src/config/permissions";

const ADMIN_OPERATIONAL_PERMISSIONS: PermisoCodigo[] = [
  PERMISOS.LISTADO_SEPARAR,
  PERMISOS.LISTADO_ENTREGAR,
  PERMISOS.LISTADO_DESCONTAR,
  PERMISOS.LISTADO_RETROCEDER,
  PERMISOS.VALE_SEPARAR,
  PERMISOS.VALE_ENTREGAR,
  PERMISOS.VALE_DESCONTAR,
  PERMISOS.VALE_RETROCEDER,
  PERMISOS.VALE_RETROCEDER_DESCUENTO,
];

/**
 * Sincroniza de forma idempotente y transaccional los 9 permisos operativos
 * para el rol ADMIN en la tabla `roles_permisos` sin eliminar ni sobrescribir
 * configuraciones existentes ni excepciones individuales (`excepciones_permisos_usuario`).
 *
 * Si se producen altas o reactivaciones en `roles_permisos`, incrementa
 * `versionPermisos` de los usuarios ADMIN afectados para forzar la renovación
 * transparente de sus sesiones activas.
 */
export async function syncAdminOperationalPermissions() {
  return prisma.$transaction(async (tx) => {
    const rolAdmin = await tx.rol.findUnique({
      where: { codigo: "ADMIN" },
    });

    if (!rolAdmin) {
      throw new Error("El rol ADMIN no existe en la base de datos.");
    }

    const permisosAgregados: string[] = [];
    const permisosYaActivos: string[] = [];

    for (const codigo of ADMIN_OPERATIONAL_PERMISSIONS) {
      const meta = PERMISOS_METADATA.find((m) => m.codigo === codigo);
      if (!meta) {
        throw new Error(`Metadatos no encontrados para el permiso ${codigo}`);
      }

      // Asegurar que el permiso exista y esté activo en el catálogo `permisos`
      const permiso = await tx.permiso.upsert({
        where: { codigo: meta.codigo },
        update: {
          modulo: meta.modulo,
          descripcion: meta.descripcion,
          estado: "ACTIVO",
        },
        create: {
          codigo: meta.codigo,
          modulo: meta.modulo,
          descripcion: meta.descripcion,
          estado: "ACTIVO",
        },
      });

      const existente = await tx.rolPermiso.findUnique({
        where: {
          rolId_permisoId: {
            rolId: rolAdmin.id,
            permisoId: permiso.id,
          },
        },
      });

      if (!existente) {
        await tx.rolPermiso.create({
          data: {
            rolId: rolAdmin.id,
            permisoId: permiso.id,
            estado: "ACTIVO",
          },
        });
        permisosAgregados.push(codigo);
      } else if (existente.estado !== "ACTIVO") {
        await tx.rolPermiso.update({
          where: {
            rolId_permisoId: {
              rolId: rolAdmin.id,
              permisoId: permiso.id,
            },
          },
          data: { estado: "ACTIVO" },
        });
        permisosAgregados.push(codigo);
      } else {
        permisosYaActivos.push(codigo);
      }
    }

    let usuariosActualizados = 0;
    if (permisosAgregados.length > 0) {
      const resUpdate = await tx.usuario.updateMany({
        where: { rolId: rolAdmin.id },
        data: {
          versionPermisos: { increment: 1 },
        },
      });
      usuariosActualizados = resUpdate.count;
    }

    return {
      rolId: rolAdmin.id,
      rolCodigo: rolAdmin.codigo,
      permisosAgregados,
      permisosYaActivos,
      usuariosActualizados,
    };
  });
}

if (import.meta.main) {
  syncAdminOperationalPermissions()
    .then((res) => {
      console.log("[sync-admin-permisos] Sincronización completada:", JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[sync-admin-permisos] Error en sincronización:", err);
      process.exit(1);
    });
}
