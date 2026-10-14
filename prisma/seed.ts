import { prisma } from "../src/config/database";
import { securityService } from "../src/modules/auth/services/security.service";
import { PERMISOS, PERMISOS_METADATA } from "../src/config/permissions";
import { syncHistorico } from "../scripts/sync-historico";

/**
 * Seed Oficial para Producción y Desarrollo.
 *
 * Configuración:
 * 1. Limpieza de datos (purgado seguro) si se requiere reiniciar la BD o ejecutar múltiples veces.
 * 2. Departamentos base: MATERIA_PRIMA y PIELES (SISTEMAS para administración global).
 * 3. Líneas de Producción oficiales (definidas en catálogo base).
 * 4. Matriz completa de permisos y roles del sistema.
 * 5. Único Usuario Inicial: SUPER_ADMIN ("admin" / "Deadmau6" configurable vía .env).
 * 6. Sincronización automática del histórico de listados (backend/scripts/sync-historico.ts).
 */
async function main() {
  console.log("==================================================");
  console.log("Iniciando Seed Oficial de Base de Datos");
  console.log("==================================================");

  // 0. Limpieza previa para permitir re-ejecución limpia (Idempotencia / Reset)
  console.log("0. Limpiando datos operativos previos...");
  // Purgar en orden inverso a dependencias de clave foránea
  await prisma.historialEstadoFrente.deleteMany();
  await prisma.historialEstadoListado.deleteMany();
  await prisma.listadoSurtidoFrente.deleteMany();
  await prisma.listadoMaterial.deleteMany();
  await prisma.registroAuditoria.deleteMany();
  await prisma.sesion.deleteMany();
  await prisma.usuarioLineaProduccion.deleteMany();
  await prisma.excepcionPermisoUsuario.deleteMany();
  await prisma.usuario.deleteMany();
  console.log("   -> Tablas operativas y usuarios limpiados correctamente.");

  // 1. Departamentos iniciales
  console.log("1. Sincronizando departamentos base...");
  const deptoMateriaPrima = await prisma.departamento.upsert({
    where: { codigo: "MATERIA_PRIMA" },
    update: { nombre: "Materia Prima", estado: "ACTIVO" },
    create: {
      codigo: "MATERIA_PRIMA",
      nombre: "Materia Prima",
      estado: "ACTIVO",
    },
  });

  const deptoPieles = await prisma.departamento.upsert({
    where: { codigo: "PIELES" },
    update: { nombre: "Pieles", estado: "ACTIVO" },
    create: {
      codigo: "PIELES",
      nombre: "Pieles",
      estado: "ACTIVO",
    },
  });

  const deptoSistemas = await prisma.departamento.upsert({
    where: { codigo: "SISTEMAS" },
    update: { nombre: "Sistemas y Administración", estado: "ACTIVO" },
    create: {
      codigo: "SISTEMAS",
      nombre: "Sistemas y Administración",
      estado: "ACTIVO",
    },
  });

  // 2. Líneas de Producción institucionales
  console.log("2. Sincronizando líneas de producción institucionales...");
  const lineasMateriaPrimaBase: Array<{ codigo: string; nombre: string; area: "BOTA" | "ACCESORIOS"; orden: number }> = [
    // BOTA:
    { codigo: "BOTA", nombre: "BOTA", area: "BOTA", orden: 1 },
    { codigo: "COMPL_BOTA", nombre: "COMPL. BOTA", area: "BOTA", orden: 2 },
    { codigo: "BOTA_LAG", nombre: "BOTA LAG", area: "BOTA", orden: 3 },
    { codigo: "BOTA_FAC", nombre: "BOTA FAC", area: "BOTA", orden: 4 },
    { codigo: "CAJA_ESPECIAL", nombre: "CAJA ESPECIAL", area: "BOTA", orden: 5 },

    // ACCESORIOS:
    { codigo: "CINTOS", nombre: "CINTOS", area: "ACCESORIOS", orden: 1 },
    { codigo: "CINTOS_MAQ", nombre: "CINTOS MAQ", area: "ACCESORIOS", orden: 2 },
    { codigo: "BILLETERAS", nombre: "BILLETERAS", area: "ACCESORIOS", orden: 3 },
    { codigo: "CHAMARRAS", nombre: "CHAMARRAS", area: "ACCESORIOS", orden: 4 },
    { codigo: "BETA_7", nombre: "BETA 7", area: "ACCESORIOS", orden: 5 },
    { codigo: "BOLSAS", nombre: "BOLSAS", area: "ACCESORIOS", orden: 6 },
  ];

  for (const lin of lineasMateriaPrimaBase) {
    await prisma.lineaProduccion.upsert({
      where: { codigo: lin.codigo },
      update: {
        nombre: lin.nombre,
        departamentoId: deptoMateriaPrima.id,
        area: lin.area,
        orden: lin.orden,
        estado: "ACTIVO",
      },
      create: {
        codigo: lin.codigo,
        nombre: lin.nombre,
        departamentoId: deptoMateriaPrima.id,
        area: lin.area,
        orden: lin.orden,
        estado: "ACTIVO",
      },
    });
  }

  // 3. Sincronizar Catálogo de Permisos
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
        PERMISOS.LISTADO_CANCELAR,
        PERMISOS.LISTADO_DESCONTAR,
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
    const rol = await prisma.rol.upsert({
      where: { codigo: rolDef.codigo },
      update: {
        nombre: rolDef.nombre,
        estado: "ACTIVO",
      },
      create: {
        codigo: rolDef.codigo,
        nombre: rolDef.nombre,
        estado: "ACTIVO",
      },
    });
    rolesRegistrados[rolDef.codigo] = rol;

    // Asignar permisos default para el rol
    for (const codPermiso of rolDef.permisosDefault) {
      const p = permisosCreados[codPermiso];
      if (p) {
        await prisma.rolPermiso.upsert({
          where: {
            rolId_permisoId: {
              rolId: rol.id,
              permisoId: p.id,
            },
          },
          update: { estado: "ACTIVO" },
          create: {
            rolId: rol.id,
            permisoId: p.id,
            estado: "ACTIVO",
          },
        });
      }
    }
  }

  // 5. Usuario Inicial: Único Super Administrador
  console.log("5. Creando usuario Super Administrador inicial...");
  const adminUsuario = process.env.SUPER_ADMIN_USUARIO || "admin";
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || "Deadmau6";
  const adminPasswordHash = securityService.hashPassword(adminPassword);
  const adminPasswordEncrypted = securityService.encryptPassword(adminPassword);

  const rolSuperAdmin = rolesRegistrados["SUPER_ADMIN"]!;

  const superAdminUsuario = await prisma.usuario.upsert({
    where: { usuario: adminUsuario },
    update: {
      passwordHash: adminPasswordHash,
      passwordEncrypted: adminPasswordEncrypted,
      rolId: rolSuperAdmin.id,
      departamentoId: deptoSistemas.id,
      estado: "ACTIVO",
    },
    create: {
      usuario: adminUsuario,
      nombre: "Super Administrador",
      passwordHash: adminPasswordHash,
      passwordEncrypted: adminPasswordEncrypted,
      rolId: rolSuperAdmin.id,
      departamentoId: deptoSistemas.id,
      estado: "ACTIVO",
    },
  });
  console.log(`   -> Super Admin creado: "${adminUsuario}" (Clave configurada)`);

  // 6. Registro de auditoría
  await prisma.registroAuditoria.create({
    data: {
      usuarioId: superAdminUsuario.id,
      accion: "SEED_INICIAL",
      entidad: "Sistema",
      entidadId: superAdminUsuario.id,
      detalle: "Inicialización oficial de departamentos, líneas, permisos y super administrador.",
    },
  });

  // 7. Sincronizar Histórico de Listados (backend/scripts/sync-historico.ts)
  console.log("7. Ejecutando sincronización de histórico de listados...");
  await syncHistorico();

  console.log("==================================================");
  console.log("✅ Seed oficial completado exitosamente!");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("❌ Error al ejecutar seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });