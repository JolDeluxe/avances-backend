import { prisma } from "../src/config/database";
import { securityService } from "../src/modules/auth/services/security.service";
import { PERMISOS, PERMISOS_METADATA } from "../src/config/permissions";

/**
 * Seed de inicialización y sincronización segura (Bootstrap Idempotente).
 *
 * Principio Arquitectónico:
 * 1. Es NO DESTRUCTIVO: Jamás ejecuta DELETE ni trunca tablas existentes.
 * 2. Idempotente: Si una entidad ya existe (departamento, línea, rol, usuario),
 *    se preserva intacta con su estado y configuraciones administrativas.
 * 3. Permisos de roles: Solo se asignan los defaults si el rol es NUEVO. Si el rol
 *    ya existía en la base de datos, sus asignaciones en `roles_permisos` NO se tocan,
 *    respetando las personalizaciones hechas por los administradores.
 * 4. Catálogo de capacidades: Se sincroniza mediante `upsert` por código,
 *    actualizando metadata sin borrar permisos existentes.
 */
async function main() {
  console.log("==================================================");
  console.log("Iniciando Seed: Sincronización y Bootstrap Seguro");
  console.log("==================================================");

  // 1. Departamentos iniciales (upsert por código para no duplicar ni alterar existentes)
  console.log("1. Sincronizando departamentos base...");
  const deptoMateriaPrima = await prisma.departamento.upsert({
    where: { codigo: "MATERIA_PRIMA" },
    update: {},
    create: {
      codigo: "MATERIA_PRIMA",
      nombre: "Materia Prima",
      estado: "ACTIVO",
    },
  });

  const deptoPieles = await prisma.departamento.upsert({
    where: { codigo: "PIELES" },
    update: {},
    create: {
      codigo: "PIELES",
      nombre: "Pieles",
      estado: "ACTIVO",
    },
  });

  const deptoSistemas = await prisma.departamento.upsert({
    where: { codigo: "SISTEMAS" },
    update: {},
    create: {
      codigo: "SISTEMAS",
      nombre: "Sistemas y Administración",
      estado: "ACTIVO",
    },
  });

  // 2. Líneas de Producción institucionales de Materia Prima
  console.log("2. Sincronizando líneas de producción institucionales...");
  const lineasMateriaPrimaBase: Array<{ codigo: string; nombre: string; area: "BOTA" | "ACCESORIOS" }> = [
    { codigo: "BOTA", nombre: "BOTA", area: "BOTA" },
    { codigo: "BOTA_FAC", nombre: "BOTA FAC", area: "BOTA" },
    { codigo: "BOTA_LAG", nombre: "BOTA LAG", area: "BOTA" },
    { codigo: "BILLETERAS", nombre: "BILLETERAS", area: "ACCESORIOS" },
    { codigo: "BOLSAS", nombre: "BOLSAS", area: "ACCESORIOS" },
    { codigo: "CHAMARRAS", nombre: "CHAMARRAS", area: "ACCESORIOS" },
    { codigo: "CINTOS", nombre: "CINTOS", area: "ACCESORIOS" },
  ];

  const lineasInstMap: Record<string, { id: number; codigo: string }> = {};

  for (const lin of lineasMateriaPrimaBase) {
    const linea = await prisma.lineaProduccion.upsert({
      where: { codigo: lin.codigo },
      update: {
        nombre: lin.nombre,
        departamentoId: deptoMateriaPrima.id,
        area: lin.area,
        estado: "ACTIVO",
      },
      create: {
        codigo: lin.codigo,
        nombre: lin.nombre,
        departamentoId: deptoMateriaPrima.id,
        area: lin.area,
        estado: "ACTIVO",
      },
    });
    lineasInstMap[lin.codigo] = linea;
  }

  // 3. Sincronizar Catálogo de Permisos desde src/config/permissions.ts
  console.log("3. Sincronizando catálogo de capacidades (permisos)...");
  const permisosCreados: Record<string, { id: number; codigo: string }> = {};

  for (const meta of PERMISOS_METADATA) {
    const permiso = await prisma.permiso.upsert({
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
    permisosCreados[permiso.codigo] = permiso;
  }
  console.log(`   ${Object.keys(permisosCreados).length} permisos sincronizados.`);

  // 4. Roles y Asignación de Permisos Default
  console.log("4. Sincronizando roles y asignando permisos default...");

  // Definición de roles base y sus permisos default iniciales
  const rolesDefinicion = [
    {
      codigo: "SUPER_ADMIN",
      nombre: "Super Administrador",
      permisosDefault: Object.values(PERMISOS), // Todos los permisos
    },
    {
      codigo: "ADMIN",
      nombre: "Administrador",
      permisosDefault: [
        PERMISOS.USUARIO_VER,
        PERMISOS.USUARIO_CREAR,
        PERMISOS.USUARIO_EDITAR,
        PERMISOS.USUARIO_ELIMINAR,
        PERMISOS.USUARIO_PASSWORD_VER,
        PERMISOS.DEPARTAMENTO_VER,
        PERMISOS.DEPARTAMENTO_ADMINISTRAR,
        PERMISOS.ROL_VER,
        PERMISOS.PERMISO_VER,
        PERMISOS.LISTADO_CREAR,
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_EDITAR,
        PERMISOS.LISTADO_SEPARAR,
        PERMISOS.LISTADO_ENTREGAR,
        PERMISOS.LISTADO_RETROCEDER,
        PERMISOS.LISTADO_CANCELAR,
        PERMISOS.REGISTRO_SISTEMA_VER,
      ],
    },
    {
      codigo: "ALMACENISTA",
      nombre: "Almacenista de Material",
      permisosDefault: [
        PERMISOS.DEPARTAMENTO_VER,
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_SEPARAR,
        PERMISOS.LISTADO_ENTREGAR,
      ],
    },
    {
      codigo: "AUDITOR",
      nombre: "Auditor de Operaciones",
      permisosDefault: [
        PERMISOS.DEPARTAMENTO_VER,
        PERMISOS.ROL_VER,
        PERMISOS.PERMISO_VER,
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_DESCONTAR,
        PERMISOS.REGISTRO_SISTEMA_VER,
      ],
    },
    {
      codigo: "REGISTRADOR",
      nombre: "Registrador de Listados",
      permisosDefault: [
        PERMISOS.DEPARTAMENTO_VER,
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_CREAR,
        PERMISOS.LISTADO_EDITAR,
        PERMISOS.LISTADO_CANCELAR,
      ],
    },
  ];

  const rolesRegistrados: Record<string, { id: number; codigo: string }> = {};

  for (const rolDef of rolesDefinicion) {
    const rolExistente = await prisma.rol.findUnique({
      where: { codigo: rolDef.codigo },
    });

    let rolId: number;
    let esNuevoRol = false;

    if (!rolExistente) {
      // Si el rol no existe, se crea
      const nuevoRol = await prisma.rol.create({
        data: {
          codigo: rolDef.codigo,
          nombre: rolDef.nombre,
          estado: "ACTIVO",
        },
      });
      rolId = nuevoRol.id;
      esNuevoRol = true;
      rolesRegistrados[rolDef.codigo] = nuevoRol;
      console.log(`   Rol creado: ${rolDef.codigo}`);
    } else {
      rolId = rolExistente.id;
      rolesRegistrados[rolDef.codigo] = rolExistente;
    }

    // Regla de Asignación de Permisos:
    // Solo se aplican los permisos default si el rol es NUEVO.
    // Si el rol ya existía, se preserva íntegramente la configuración existente en `roles_permisos`.
    if (esNuevoRol) {
      console.log(`   -> Asignando matriz default inicial para nuevo rol ${rolDef.codigo}...`);
      for (const codPermiso of rolDef.permisosDefault) {
        const p = permisosCreados[codPermiso];
        if (p) {
          await prisma.rolPermiso.create({
            data: {
              rolId,
              permisoId: p.id,
              estado: "ACTIVO",
            },
          });
        }
      }
    } else {
      console.log(`   -> Rol ${rolDef.codigo} ya existe: preservando permisos y configuración actual.`);
    }
  }

  // 5. Usuarios Iniciales de Bootstrap
  console.log("5. Sincronizando usuarios iniciales de desarrollo...");
  const defaultPassword = "123456789";
  const defaultPasswordHash = securityService.hashPassword(defaultPassword);
  const defaultPasswordEncrypted = securityService.encryptPassword(defaultPassword);

  const rolSuperAdmin = rolesRegistrados["SUPER_ADMIN"]!;
  const rolAdmin = rolesRegistrados["ADMIN"]!;
  const rolAlmacenista = rolesRegistrados["ALMACENISTA"]!;
  const rolAuditor = rolesRegistrados["AUDITOR"]!;
  const rolRegistrador = rolesRegistrados["REGISTRADOR"]!;

  // SUPER_ADMIN
  const superAdminUsuario = await prisma.usuario.upsert({
    where: { usuario: "superadmin" },
    update: {
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
    },
    create: {
      usuario: "superadmin",
      nombre: "Super Administrador",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolSuperAdmin.id,
      departamentoId: deptoSistemas.id,
      estado: "ACTIVO",
    },
  });

  // ADMIN Materia Prima
  await prisma.usuario.upsert({
    where: { usuario: "admin_mp" },
    update: {
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
    },
    create: {
      usuario: "admin_mp",
      nombre: "Administrador Materia Prima",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAdmin.id,
      departamentoId: deptoMateriaPrima.id,
      estado: "ACTIVO",
    },
  });

  // ALMACENISTA Materia Prima (Directos)
  const almacenistaMpExistente = await prisma.usuario.findUnique({
    where: { usuario: "almacenista_mp" },
  });

  if (!almacenistaMpExistente) {
    await prisma.usuario.create({
      data: {
        usuario: "almacenista_mp",
        nombre: "Juan Almacenista MP",
        passwordHash: defaultPasswordHash,
        passwordEncrypted: defaultPasswordEncrypted,
        rolId: rolAlmacenista.id,
        departamentoId: deptoMateriaPrima.id,
        tipoSurtidoAlmacen: "DIRECTOS",
        estado: "ACTIVO",
        lineasAsignadas: {
          create: [
            { lineaProduccionId: lineasInstMap["BOTA"]!.id, estado: "ACTIVO" },
          ],
        },
      },
    });
    console.log("   Usuario creado: almacenista_mp");
  } else {
    await prisma.usuario.update({
      where: { id: almacenistaMpExistente.id },
      data: {
        tipoSurtidoAlmacen: "DIRECTOS",
        passwordHash: defaultPasswordHash,
        passwordEncrypted: defaultPasswordEncrypted,
      },
    });
  }

  // ALMACENISTA Pieles (Directos)
  const almacenistaPielesExistente = await prisma.usuario.findUnique({
    where: { usuario: "almacenista_pieles" },
  });

  if (!almacenistaPielesExistente) {
    await prisma.usuario.create({
      data: {
        usuario: "almacenista_pieles",
        nombre: "Carlos Almacenista Pieles",
        passwordHash: defaultPasswordHash,
        passwordEncrypted: defaultPasswordEncrypted,
        rolId: rolAlmacenista.id,
        departamentoId: deptoPieles.id,
        tipoSurtidoAlmacen: "DIRECTOS",
        estado: "ACTIVO",
      },
    });
    console.log("   Usuario creado: almacenista_pieles");
  } else {
    await prisma.usuario.update({
      where: { id: almacenistaPielesExistente.id },
      data: {
        tipoSurtidoAlmacen: "DIRECTOS",
        passwordHash: defaultPasswordHash,
        passwordEncrypted: defaultPasswordEncrypted,
      },
    });
  }

  // ALMACENISTA Bolsas (Pedro Almacenista Bolsas)
  const lineaBolsas = await prisma.lineaProduccion.findUniqueOrThrow({
    where: { codigo: "BOLSAS" },
  });

  const almacenistaBolsasExistente = await prisma.usuario.findUnique({
    where: { usuario: "almacenista_bolsas" },
  });

  if (!almacenistaBolsasExistente) {
    await prisma.usuario.create({
      data: {
        usuario: "almacenista_bolsas",
        nombre: "Pedro Almacenista Bolsas",
        passwordHash: defaultPasswordHash,
        passwordEncrypted: defaultPasswordEncrypted,
        rolId: rolAlmacenista.id,
        departamentoId: deptoMateriaPrima.id,
        tipoSurtidoAlmacen: "BOLSAS",
        estado: "ACTIVO",
        lineasAsignadas: {
          create: [{ lineaProduccionId: lineaBolsas.id, estado: "ACTIVO" }],
        },
      },
    });
    console.log("   Usuario creado: almacenista_bolsas");
  } else {
    await prisma.usuario.update({
      where: { id: almacenistaBolsasExistente.id },
      data: {
        tipoSurtidoAlmacen: "BOLSAS",
        passwordHash: defaultPasswordHash,
        passwordEncrypted: defaultPasswordEncrypted,
      },
    });
  }

  // ─── USUARIOS DE MATERIA PRIMA (OPERACIÓN Y PRUEBAS) ─────────────────────
  console.log("   Sincronizando usuarios operativos de Materia Prima...");

  // REGISTRADOR:
  // Gestiona /listados/administracion (crea listados, edita o cancela si están en PENDIENTE sin avance)
  await prisma.usuario.upsert({
    where: { usuario: "registrador_mp" },
    update: {
      nombre: "Registrador Materia Prima",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolRegistrador.id,
      departamentoId: deptoMateriaPrima.id,
      estado: "ACTIVO",
    },
    create: {
      usuario: "registrador_mp",
      nombre: "Registrador Materia Prima",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolRegistrador.id,
      departamentoId: deptoMateriaPrima.id,
      estado: "ACTIVO",
    },
  });
  console.log("   Usuario sincronizado: registrador_mp");

  // ALMACENISTAS DE MATERIA PRIMA:
  // 1. Almacenista General (Opera TODOS los frentes: DIR, IND, BOL en todas las líneas de MP)
  await prisma.usuario.upsert({
    where: { usuario: "almacen_general" },
    update: {
      nombre: "Almacenista General MP (Todos)",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAlmacenista.id,
      departamentoId: deptoMateriaPrima.id,
      tipoSurtidoAlmacen: "TODOS",
      estado: "ACTIVO",
    },
    create: {
      usuario: "almacen_general",
      nombre: "Almacenista General MP (Todos)",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAlmacenista.id,
      departamentoId: deptoMateriaPrima.id,
      tipoSurtidoAlmacen: "TODOS",
      estado: "ACTIVO",
    },
  });
  console.log("   Usuario sincronizado: almacen_general");

  // 2. Almacenista de Material Directo
  await prisma.usuario.upsert({
    where: { usuario: "almacen_directos" },
    update: {
      nombre: "Almacenista Directos MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAlmacenista.id,
      departamentoId: deptoMateriaPrima.id,
      tipoSurtidoAlmacen: "DIRECTOS",
      estado: "ACTIVO",
    },
    create: {
      usuario: "almacen_directos",
      nombre: "Almacenista Directos MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAlmacenista.id,
      departamentoId: deptoMateriaPrima.id,
      tipoSurtidoAlmacen: "DIRECTOS",
      estado: "ACTIVO",
    },
  });
  console.log("   Usuario sincronizado: almacen_directos");

  // 3. Almacenista de Material Indirecto
  await prisma.usuario.upsert({
    where: { usuario: "almacen_indirectos" },
    update: {
      nombre: "Almacenista Indirectos MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAlmacenista.id,
      departamentoId: deptoMateriaPrima.id,
      tipoSurtidoAlmacen: "INDIRECTOS",
      estado: "ACTIVO",
    },
    create: {
      usuario: "almacen_indirectos",
      nombre: "Almacenista Indirectos MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAlmacenista.id,
      departamentoId: deptoMateriaPrima.id,
      tipoSurtidoAlmacen: "INDIRECTOS",
      estado: "ACTIVO",
    },
  });
  console.log("   Usuario sincronizado: almacen_indirectos");

  // 4. Almacenista de Bolsas
  await prisma.usuario.upsert({
    where: { usuario: "almacen_bolsas" },
    update: {
      nombre: "Almacenista Bolsas MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAlmacenista.id,
      departamentoId: deptoMateriaPrima.id,
      tipoSurtidoAlmacen: "BOLSAS",
      estado: "ACTIVO",
    },
    create: {
      usuario: "almacen_bolsas",
      nombre: "Almacenista Bolsas MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAlmacenista.id,
      departamentoId: deptoMateriaPrima.id,
      tipoSurtidoAlmacen: "BOLSAS",
      estado: "ACTIVO",
    },
  });
  console.log("   Usuario sincronizado: almacen_bolsas");

  // AUDITORES DE MATERIA PRIMA:
  // 1. Auditor General (Audita y descuenta DIRECTOS e INDIRECTOS en MP)
  await prisma.usuario.upsert({
    where: { usuario: "auditor_general" },
    update: {
      nombre: "Auditor General MP (Todos)",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAuditor.id,
      departamentoId: deptoMateriaPrima.id,
      tipoMaterialAuditor: "TODOS",
      estado: "ACTIVO",
    },
    create: {
      usuario: "auditor_general",
      nombre: "Auditor General MP (Todos)",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAuditor.id,
      departamentoId: deptoMateriaPrima.id,
      tipoMaterialAuditor: "TODOS",
      estado: "ACTIVO",
    },
  });
  console.log("   Usuario sincronizado: auditor_general");

  await prisma.usuario.upsert({
    where: { usuario: "auditor_mp" },
    update: {
      nombre: "Auditor Materia Prima",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAuditor.id,
      departamentoId: deptoMateriaPrima.id,
      tipoMaterialAuditor: "TODOS",
      estado: "ACTIVO",
    },
    create: {
      usuario: "auditor_mp",
      nombre: "Auditor Materia Prima",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAuditor.id,
      departamentoId: deptoMateriaPrima.id,
      tipoMaterialAuditor: "TODOS",
      estado: "ACTIVO",
    },
  });
  console.log("   Usuario sincronizado: auditor_mp");

  // 2. Auditor de Directos (En Auditoría solo opera columna Directos)
  await prisma.usuario.upsert({
    where: { usuario: "auditor_directos" },
    update: {
      nombre: "Auditor Directos MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAuditor.id,
      departamentoId: deptoMateriaPrima.id,
      tipoMaterialAuditor: "DIRECTOS",
      estado: "ACTIVO",
    },
    create: {
      usuario: "auditor_directos",
      nombre: "Auditor Directos MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAuditor.id,
      departamentoId: deptoMateriaPrima.id,
      tipoMaterialAuditor: "DIRECTOS",
      estado: "ACTIVO",
    },
  });
  console.log("   Usuario sincronizado: auditor_directos");

  // 3. Auditor de Indirectos (En Auditoría solo opera columna Indirectos)
  await prisma.usuario.upsert({
    where: { usuario: "auditor_indirectos" },
    update: {
      nombre: "Auditor Indirectos MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAuditor.id,
      departamentoId: deptoMateriaPrima.id,
      tipoMaterialAuditor: "INDIRECTOS",
      estado: "ACTIVO",
    },
    create: {
      usuario: "auditor_indirectos",
      nombre: "Auditor Indirectos MP",
      passwordHash: defaultPasswordHash,
      passwordEncrypted: defaultPasswordEncrypted,
      rolId: rolAuditor.id,
      departamentoId: deptoMateriaPrima.id,
      tipoMaterialAuditor: "INDIRECTOS",
      estado: "ACTIVO",
    },
  });
  console.log("   Usuario sincronizado: auditor_indirectos");

  // 6. Registro de auditoría (solo si no se ha registrado previamente)
  const auditPrevio = await prisma.registroAuditoria.findFirst({
    where: { accion: "SEED_INICIAL" },
  });

  if (!auditPrevio) {
    await prisma.registroAuditoria.create({
      data: {
        usuarioId: superAdminUsuario.id,
        accion: "SEED_INICIAL",
        entidad: "Sistema",
        entidadId: superAdminUsuario.id,
        detalle: "Inicialización de departamentos, líneas, roles y usuarios iniciales.",
      },
    });
  }

  console.log("==================================================");
  console.log("Seed completado exitosamente (Modo No Destructivo)!");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Error al ejecutar seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });