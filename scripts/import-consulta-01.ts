import { readFileSync } from "fs";
import { prisma } from "../src/config/database";

const LINEAS_DEFINICION = [
  { codigo: "BOTA_LAG", nombre: "BOTA LAG" },
  { codigo: "BILLETERAS", nombre: "BILLETERAS" },
  { codigo: "CINTOS", nombre: "CINTOS" },
  { codigo: "BOLSAS", nombre: "BOLSAS" },
  { codigo: "BOTA", nombre: "BOTA" },
  { codigo: "BOTA_FAC", nombre: "BOTA FAC" },
  { codigo: "CHAMARRAS", nombre: "CHAMARRAS" },
  { codigo: "CINTOS_MAQ", nombre: "CINTOS MAQ" },
  { codigo: "BETA_7", nombre: "BETA 7" },
  { codigo: "CAJA_ESPECIAL", nombre: "CAJA ESPECIAL" },
];

function mapearNombreACodigo(nombreLinea: string): string {
  switch (nombreLinea) {
    case "BOTA LAG": return "BOTA_LAG";
    case "BILLETERAS": return "BILLETERAS";
    case "CINTOS": return "CINTOS";
    case "BOLSAS": return "BOLSAS";
    case "BOTA": return "BOTA";
    case "BOTA FAC": return "BOTA_FAC";
    case "CHAMARRAS": return "CHAMARRAS";
    case "CINTOS MAQ": return "CINTOS_MAQ";
    case "BETA 7": return "BETA_7";
    case "CAJA ESPECIAL": return "CAJA_ESPECIAL";
    default: return nombreLinea.replace(/\s+/g, "_");
  }
}

function parseFecha(fechaRaw: string): Date {
  const clean = fechaRaw.replace(/\s+/g, "");
  if (!clean) {
    // Si viene vacía (como en la fila 983), se usa la fecha actual/estimada
    return new Date(Date.UTC(2026, 6, 7)); // 07/07/2026 aprox
  }
  const [diaStr, mesStr, anioStr] = clean.split("/");
  const dia = parseInt(diaStr, 10);
  const mes = parseInt(mesStr, 10) - 1;
  let anio = parseInt(anioStr, 10);
  if (isNaN(dia) || isNaN(mes) || isNaN(anio)) {
    return new Date(Date.UTC(2026, 6, 7));
  }
  if (anio === 300) anio = 2025;
  else if (anio === 307) anio = 2026;
  else if (anio === 2304) anio = 2026;
  else if (anio < 1000) anio = 2000 + (anio % 100);

  return new Date(Date.UTC(anio, mes, dia));
}

async function run() {
  console.log("=== INICIANDO IMPORTACIÓN DE CONSULTA_01.TXT ===");

  // 1. Departamento MATERIA_PRIMA
  const deptoMP = await prisma.departamento.findUnique({
    where: { codigo: "MATERIA_PRIMA" },
  });
  if (!deptoMP) throw new Error("Departamento MATERIA_PRIMA no encontrado");

  // 2. Usuario creador
  const usuarioCreador = await prisma.usuario.findFirst({
    where: { estado: "ACTIVO" },
    orderBy: { id: "asc" },
  });
  if (!usuarioCreador) throw new Error("No hay usuario activo");

  // 3. Upsert de todas las líneas necesarias
  console.log("Sincronizando líneas de producción...");
  const lineasMap = new Map<string, number>();

  for (const def of LINEAS_DEFINICION) {
    const linea = await prisma.lineaProduccion.upsert({
      where: { codigo: def.codigo },
      update: {
        nombre: def.nombre,
        departamentoId: deptoMP.id,
        estado: "ACTIVO",
      },
      create: {
        codigo: def.codigo,
        nombre: def.nombre,
        departamentoId: deptoMP.id,
        estado: "ACTIVO",
      },
    });
    lineasMap.set(def.codigo, linea.id);
  }

  // 4. Leer Consulta_01.txt
  const content = readFileSync("scripts/Consulta_01.txt", "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

  console.log(`Leídas ${lines.length - 1} filas de listados desde Consulta_01.txt`);

  let procesados = 0;
  let creados = 0;
  let actualizados = 0;

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split("\t");
    if (parts.length < 5) continue;

    const [, , lineaStr, listaStr, fechaStr] = parts;
    const lineaNombre = lineaStr.trim();
    const numeroListado = listaStr.trim();
    const codigoLinea = mapearNombreACodigo(lineaNombre);
    const lineaId = lineasMap.get(codigoLinea);

    if (!lineaId) {
      console.warn(`Línea no encontrada para: ${lineaNombre} (fila ${i})`);
      continue;
    }

    const fechaRequerida = parseFecha(fechaStr);

    const exist = await prisma.listadoMaterial.findUnique({
      where: { numeroListado },
    });

    if (exist) {
      await prisma.listadoMaterial.update({
        where: { id: exist.id },
        data: {
          lineaProduccionId: lineaId,
          departamentoId: deptoMP.id,
          fechaRequerida,
        },
      });
      actualizados++;
    } else {
      await prisma.listadoMaterial.create({
        data: {
          numeroListado,
          fechaRequerida,
          departamentoId: deptoMP.id,
          lineaProduccionId: lineaId,
          estado: "PENDIENTE",
          creadoPorUsuarioId: usuarioCreador.id,
        },
      });
      creados++;
    }

    procesados++;
  }

  console.log("\n=== IMPORTACIÓN FINALIZADA CON ÉXITO ===");
  console.log(`- Filas procesadas: ${procesados}`);
  console.log(`- Listados creados: ${creados}`);
  console.log(`- Listados actualizados: ${actualizados}`);

  const totalFinal = await prisma.listadoMaterial.count();
  console.log(`- Total listados actuales en BD: ${totalFinal}`);
}

run()
  .catch((e) => {
    console.error("Error importando:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
