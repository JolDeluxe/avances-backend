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
  await prisma.historialEstadoVale.deleteMany();
  await prisma.valeMaterial.deleteMany();
  await prisma.usuarioAutorizacionValeDepartamento.deleteMany();
  await prisma.usuarioAutorizacionValeArea.deleteMany();
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

  // 2.1. Catálogos iniciales de Vales (Series y Departamentos Operativos)
  console.log("2.1. Sincronizando catálogos base de Vales (Series y Departamentos Operativos)...");
  const seriesValeBase = ["KAACM", "KABTM", "VAARC", "VAARM", "VABTM", "VACCM"];

  for (const codigoSerie of seriesValeBase) {
    await prisma.serieVale.upsert({
      where: {
        unique_serie_vale_depto_codigo: {
          departamentoId: deptoMateriaPrima.id,
          codigo: codigoSerie,
        },
      },
      update: {
        esSistema: true,
        estado: "ACTIVO",
      },
      create: {
        departamentoId: deptoMateriaPrima.id,
        codigo: codigoSerie,
        esSistema: true,
        estado: "ACTIVO",
      },
    });
  }

  const departamentosValeBase: Array<{
    codigo: string;
    areaFija: "BOTA" | "ACCESORIOS" | "OTRO" | null;
    requiereSeleccionArea: boolean;
  }> = [
    // Área BOTA
    { codigo: "BOT ACABADO", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT ADORNO", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT AVIO SUELA", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT AVIO TACON", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT BORDADO", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT CORTE", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT KIT COMPLET", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT LASER", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT MONTADO", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PPTE BANDA2", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PPTE CELULA", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PPTE PRELIM", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PPTE VAQUER", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PRE MONTADO", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PREL KAPPA", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PRELIMINAR", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PREMONTADOT", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PRODUCCION", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PROGRAMA", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "BOT PT PR KAPPA", areaFija: "BOTA", requiereSeleccionArea: false },
    { codigo: "DESARROLLO BOTA", areaFija: "BOTA", requiereSeleccionArea: false },

    // Área ACCESORIOS
    { codigo: "ACC DESARROLLO", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BIL ADORNO", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BIL COMPONENTES", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BIL CORTE", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BIL EXOTICO", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BIL PESPUNTE", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BIL PREARMADO", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BIL PROGRAMA", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BIL TEJIDOS", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BOL ADORNO", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BOL CORTE", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BOL PESPUNTE", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BOL PREARMADO", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "BOL PROGRAMA", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "CHA CORTE", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "CHA PESPUNTE", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "CHA PROGRAMA", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "CIN ADORNO", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "CIN CORTE", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "CIN ENSAMBLE", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "CIN PESP-PINTAD", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "CIN PREARMADO", areaFija: "ACCESORIOS", requiereSeleccionArea: false },
    { codigo: "CIN PROGRAMA", areaFija: "ACCESORIOS", requiereSeleccionArea: false },

    // Área OTRO
    { codigo: "ALMACEN DE PIEL", areaFija: "OTRO", requiereSeleccionArea: false },
    { codigo: "CALIDAD MBC", areaFija: "OTRO", requiereSeleccionArea: false },
    { codigo: "MANTENIMIENTO", areaFija: "OTRO", requiereSeleccionArea: false },
    { codigo: "PT", areaFija: "OTRO", requiereSeleccionArea: false },

    // Excepción B7 (requiere selección explícita de área BOTA | ACCESORIOS | OTRO en cada vale)
    { codigo: "B7 ADORNO", areaFija: null, requiereSeleccionArea: true },
    { codigo: "B7 CORTE", areaFija: null, requiereSeleccionArea: true },
    { codigo: "B7 MULTIFUNCION", areaFija: null, requiereSeleccionArea: true },
    { codigo: "B7 PROGRAMA", areaFija: null, requiereSeleccionArea: true },
  ];

  for (const deptoVale of departamentosValeBase) {
    const codigoNormalizado = deptoVale.codigo.trim().replace(/\s+/g, " ").toUpperCase();
    await prisma.departamentoVale.upsert({
      where: {
        unique_depto_vale_depto_codigo: {
          departamentoId: deptoMateriaPrima.id,
          codigo: codigoNormalizado,
        },
      },
      update: {
        nombre: codigoNormalizado,
        areaFija: deptoVale.areaFija,
        requiereSeleccionArea: deptoVale.requiereSeleccionArea,
        esSistema: true,
        estado: "ACTIVO",
      },
      create: {
        departamentoId: deptoMateriaPrima.id,
        codigo: codigoNormalizado,
        nombre: codigoNormalizado,
        areaFija: deptoVale.areaFija,
        requiereSeleccionArea: deptoVale.requiereSeleccionArea,
        esSistema: true,
        estado: "ACTIVO",
      },
    });
  }
  console.log(`   ${seriesValeBase.length} series y ${departamentosValeBase.length} departamentos operativos de vales sincronizados.`);

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
        PERMISOS.DEPARTAMENTO_VER,
        PERMISOS.ROL_VER,
        PERMISOS.PERMISO_VER,
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_CREAR,
        PERMISOS.LISTADO_EDITAR,
        PERMISOS.LISTADO_CANCELAR,
        PERMISOS.LISTADO_SEPARAR,
        PERMISOS.LISTADO_ENTREGAR,
        PERMISOS.LISTADO_DESCONTAR,
        PERMISOS.LISTADO_RETROCEDER,
        PERMISOS.VALE_VER,
        PERMISOS.VALE_CREAR,
        PERMISOS.VALE_EDITAR,
        PERMISOS.VALE_CANCELAR,
        PERMISOS.VALE_SEPARAR,
        PERMISOS.VALE_ENTREGAR,
        PERMISOS.VALE_DESCONTAR,
        PERMISOS.VALE_RETROCEDER,
        PERMISOS.VALE_RETROCEDER_DESCUENTO,
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
        PERMISOS.VALE_VER,
        PERMISOS.VALE_SEPARAR,
        PERMISOS.VALE_ENTREGAR,
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
        PERMISOS.LISTADO_RETROCEDER,
        PERMISOS.VALE_VER,
        PERMISOS.VALE_DESCONTAR,
        PERMISOS.VALE_RETROCEDER,
        PERMISOS.VALE_RETROCEDER_DESCUENTO,
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
        PERMISOS.VALE_VER,
        PERMISOS.VALE_CREAR,
        PERMISOS.VALE_EDITAR,
        PERMISOS.VALE_CANCELAR,
      ],
    },
    {
      codigo: "VISUALIZADOR",
      nombre: "Visualizador",
      permisosDefault: [
        PERMISOS.DEPARTAMENTO_VER,
        PERMISOS.ROL_VER,
        PERMISOS.PERMISO_VER,
        PERMISOS.USUARIO_VER,
        PERMISOS.LISTADO_VER,
        PERMISOS.VALE_VER,
        PERMISOS.REGISTRO_SISTEMA_VER,
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

    // Limpiar permisos previos del rol para garantizar sincronización exacta con permisosDefault
    await prisma.rolPermiso.deleteMany({
      where: { rolId: rol.id },
    });

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

  const rolVisualizador = rolesRegistrados["VISUALIZADOR"];
  if (rolVisualizador) {
    await prisma.usuario.upsert({
      where: { usuario: "visualizador" },
      update: {
        nombre: "Visualizador",
        passwordHash: adminPasswordHash,
        passwordEncrypted: adminPasswordEncrypted,
        rolId: rolVisualizador.id,
        departamentoId: deptoMateriaPrima.id,
        estado: "ACTIVO",
      },
      create: {
        usuario: "visualizador",
        nombre: "Visualizador",
        passwordHash: adminPasswordHash,
        passwordEncrypted: adminPasswordEncrypted,
        rolId: rolVisualizador.id,
        departamentoId: deptoMateriaPrima.id,
        estado: "ACTIVO",
      },
    });
    console.log(`   -> Usuario Visualizador creado: "visualizador"`);
  }

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