import { prisma } from "../src/config/database";
import { PERMISOS, PERMISOS_METADATA } from "../src/config/permissions";

const seriesValeBase = ["KAACM", "KABTM", "VAARC", "VAARM", "VABTM", "VACCM"];

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

  // Excepción B7
  { codigo: "B7 ADORNO", areaFija: null, requiereSeleccionArea: true },
  { codigo: "B7 CORTE", areaFija: null, requiereSeleccionArea: true },
  { codigo: "B7 MULTIFUNCION", areaFija: null, requiereSeleccionArea: true },
  { codigo: "B7 PROGRAMA", areaFija: null, requiereSeleccionArea: true },
];

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

export async function syncProduccionVales() {
  console.log("=== Sincronización Integral de Vales, Catálogos y Permisos ===");

  return prisma.$transaction(async (tx) => {
    // 1. Obtener departamento MATERIA_PRIMA
    const deptoMateriaPrima = await tx.departamento.findFirst({
      where: {
        OR: [
          { codigo: "MATERIA_PRIMA" },
          { nombre: { contains: "Materia Prima" } },
        ],
      },
    });

    if (!deptoMateriaPrima) {
      throw new Error("No se encontró el departamento MATERIA_PRIMA en la base de datos.");
    }
    console.log(`1. Departamento MATERIA_PRIMA identificado (ID: ${deptoMateriaPrima.id})`);

    // 2. Sincronizar Series de Vales
    console.log("2. Sincronizando series base de vales...");
    for (const codigoSerie of seriesValeBase) {
      await tx.serieVale.upsert({
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
    console.log(`   ✔ ${seriesValeBase.length} series sincronizadas.`);

    // 3. Sincronizar Departamentos de Vales
    console.log("3. Sincronizando departamentos operativos de vales...");
    for (const deptoVale of departamentosValeBase) {
      const codigoNormalizado = deptoVale.codigo.trim().replace(/\s+/g, " ").toUpperCase();
      await tx.departamentoVale.upsert({
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
    console.log(`   ✔ ${departamentosValeBase.length} departamentos operativos sincronizados.`);

    // 4. Sincronizar Catálogo de Permisos
    console.log("4. Sincronizando catálogo canónico de permisos...");
    const permisosCreados: Record<string, { id: number; codigo: string }> = {};

    for (const meta of PERMISOS_METADATA) {
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
      permisosCreados[permiso.codigo] = permiso;
    }
    console.log(`   ✔ ${Object.keys(permisosCreados).length} permisos sincronizados.`);

    // 5. Sincronizar Permisos para TODOS los Roles
    console.log("5. Sincronizando asignaciones base de roles_permisos...");
    let totalAsignados = 0;

    for (const rolDef of rolesDefinicion) {
      const rol = await tx.rol.findUnique({
        where: { codigo: rolDef.codigo },
      });

      if (!rol) {
        console.warn(`   ⚠ Rol ${rolDef.codigo} no encontrado en la BD. Omitiendo.`);
        continue;
      }

      for (const codPermiso of rolDef.permisosDefault) {
        const p = permisosCreados[codPermiso];
        if (p) {
          await tx.rolPermiso.upsert({
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
          totalAsignados++;
        }
      }
      console.log(`   ✔ Rol ${rolDef.codigo} sincronizado con ${rolDef.permisosDefault.length} permisos.`);
    }

    // 6. Incrementar versionPermisos para TODOS los usuarios activos
    console.log("6. Actualizando versionPermisos de usuarios para renovación transparente de sesión...");
    const resUsers = await tx.usuario.updateMany({
      where: { estado: "ACTIVO" },
      data: {
        versionPermisos: { increment: 1 },
      },
    });
    console.log(`   ✔ ${resUsers.count} usuarios actualizados con nueva versionPermisos.`);

    console.log("=== Sincronización completada con éxito ===");
    return {
      seriesSincronizadas: seriesValeBase.length,
      departamentosSincronizados: departamentosValeBase.length,
      permisosSincronizados: Object.keys(permisosCreados).length,
      usuariosActualizados: resUsers.count,
    };
  });
}

if (import.meta.main) {
  syncProduccionVales()
    .then((res) => {
      console.log("Resultado final:", JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Error en sincronización:", err);
      process.exit(1);
    });
}
