import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/config/database';

/**
 * Script de Sincronización e Importación del Histórico de Listados
 *
 * Lee los archivos de avance/consulta:
 * - Consulta_01.txt: Catálogo base de listados (No, ID, LINEA / MAQ, LISTA, FECHA, Order).
 * - Consulta_02.txt: Estados de Directos (SEPARADO / ENTREGADO).
 * - Consulta_03.txt: Estados de Indirectos (SEPARADO / ENTREGADO).
 * - Consulta_04.txt: Estados de Bolsas (SEPARADO / ENTREGADO).
 * - Consulta_05.txt: Descuentos de Directos y Bolsas en ERP.
 * - Consulta_06.txt: Descuentos de Indirectos en ERP.
 *
 * Características:
 * - Idempotente: Puede ejecutarse múltiples veces; si un listado ya existe, actualiza sus frentes y estado.
 * - Soporte multi-entorno: Lee la ruta de archivos desde la variable HISTORICO_PATH o usa por defecto la ruta de red UNC.
 * - Limpieza inicial opcional (--clean): Si se pasa el argumento `--clean`, purga primero los listados existentes.
 */

// Ruta por defecto a la carpeta compartida o variable de entorno
const DEFAULT_HISTORICO_DIR =
  process.env.HISTORICO_PATH ||
  '//200.1.1.58/usuariosmbc/COMPRAS/ALMACEN DE M.P/SISTEMAS DE GESTION/Proyectos/Avances';

const KNOWN_LINEAS_FALLBACK = [
  'BOTA LAG',
  'BOTA FAC',
  'CINTOS MAQ',
  'CAJA ESPECIAL',
  'BETA 7',
  'BOTA AVE',
  'BOTA',
  'BOLSAS',
  'CHAMARRAS',
  'CINTOS',
  'BILLETERAS',
];

interface ListadoRawItem {
  id: string; // Ej: "BOTA LAG 25L31"
  lineaNombre: string; // Ej: "BOTA LAG"
  numeroListado: string; // Ej: "25L31"
  fechaRequeridaStr: string; // Ej: "07/07/2025"
}

/** Limpia el prefijo del nombre de línea para dejar solo el número puro del listado (ej: "BOTA 25151" -> "25151") */
function cleanNumeroListado(rawIdOrLista: string, lineaNombre?: string): string {
  let val = rawIdOrLista.trim();
  if (lineaNombre) {
    const prefixRegex = new RegExp(`^${lineaNombre.trim()}\\s+`, 'i');
    val = val.replace(prefixRegex, '');
  }
  for (const known of KNOWN_LINEAS_FALLBACK) {
    const prefixRegex = new RegExp(`^${known}\\s+`, 'i');
    val = val.replace(prefixRegex, '');
  }
  return val.trim();
}

/** Parsea una fecha en formato "DD/MM/YYYY" o "DD / MM / YYYY" a objeto Date UTC, validando que el año esté en rango 2020-2030 */
function parseDate(dateStr?: string, fallbackDateStr?: string): Date {
  const tryParse = (str?: string): Date | null => {
    if (!str) return null;
    const cleaned = str.replace(/\s+/g, '');
    const parts = cleaned.split('/');
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const day = Number.parseInt(parts[0], 10);
      const month = Number.parseInt(parts[1], 10) - 1;
      const year = Number.parseInt(parts[2], 10);
      if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
        if (year >= 2020 && year <= 2030) {
          return new Date(Date.UTC(year, month, day));
        }
      }
    }
    return null;
  };

  const primary = tryParse(dateStr);
  if (primary) return primary;

  const fallback = tryParse(fallbackDateStr);
  if (fallback) return fallback;

  // Fallback seguro si la fecha original era corrupta (ej: 0300) y no hubo fecha de evento: año 2025
  return new Date(Date.UTC(2025, 0, 1));
}

async function run(): Promise<void> {
  const isClean = process.argv.includes('--clean');
  console.log('='.repeat(70));
  console.log('🚀 INICIANDO IMPORTACIÓN DE HISTÓRICO DE LISTADOS');
  console.log(`📁 Directorio fuente: ${DEFAULT_HISTORICO_DIR}`);
  console.log(`🧹 Modo Clean: ${isClean ? 'SÍ (borrando listados previos)' : 'NO (inserción incremental)'}`);
  console.log('='.repeat(70));

  // 1. Verificar acceso a los archivos
  if (!fs.existsSync(DEFAULT_HISTORICO_DIR)) {
    throw new Error(`No se puede acceder al directorio fuente: ${DEFAULT_HISTORICO_DIR}`);
  }

  // 2. Cargar líneas de producción y departamentos existentes en BD
  const lineasDb = await prisma.lineaProduccion.findMany({
    select: { id: true, nombre: true, area: true, departamentoId: true },
  });
  const lineaMap = new Map<string, { id: number; area: string; departamentoId: number }>();
  for (const l of lineasDb) {
    const info = {
      id: l.id,
      area: l.area,
      departamentoId: l.departamentoId,
    };
    lineaMap.set(l.nombre.trim().toUpperCase(), info);
    // Mapear variaciones comunes de plural / singular
    if (l.nombre.trim().toUpperCase() === 'CINTO') {
      lineaMap.set('CINTOS', info);
    }
    if (l.nombre.trim().toUpperCase() === 'BOLSAS') {
      lineaMap.set('BOLSA', info);
    }
    if (l.nombre.trim().toUpperCase() === 'CHAMARRAS') {
      lineaMap.set('CHAMARRA', info);
    }
    if (l.nombre.trim().toUpperCase() === 'BILLETERAS') {
      lineaMap.set('BILLETERA', info);
    }
  }

  const deptoDefault = await prisma.departamento.findFirst({
    where: { codigo: 'MATERIA_PRIMA' },
  });
  if (!deptoDefault) {
    throw new Error('No se encontró el departamento MATERIA_PRIMA en la base de datos.');
  }

  const superAdmin = await prisma.usuario.findFirst({
    where: { rol: { codigo: 'SUPER_ADMIN' } },
  });
  const defaultUserId = superAdmin ? superAdmin.id : 1;

  // 3. Limpieza si se solicitó --clean
  if (isClean) {
    console.log('🧹 Purgando listados, frentes e historiales existentes...');
    await prisma.historialEstadoFrente.deleteMany();
    await prisma.historialEstadoListado.deleteMany();
    await prisma.listadoSurtidoFrente.deleteMany();
    await prisma.listadoMaterial.deleteMany();
    console.log('✅ Base de datos purgada exitosamente.');
  }

  // 4. Leer Consulta_01.txt (Listados base)
  const pathC1 = path.join(DEFAULT_HISTORICO_DIR, 'Consulta_01.txt');
  const raw01 = fs.readFileSync(pathC1, 'latin1');
  const lines01 = raw01.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const listadosMap = new Map<string, ListadoRawItem>();

  for (let i = 1; i < lines01.length; i++) {
    const currentLine = lines01[i];
    if (!currentLine) continue;
    const parts = currentLine.split('\t');
    const id = parts[1]?.trim();
    const linea = parts[2]?.trim();
    const lista = parts[3]?.trim();
    const fecha = parts[4]?.trim();

    if (id && !id.startsWith('x') && id !== 'LINEA / MAQ LISTA') {
      const lineaNombre = linea || 'BOTA';
      const cleanNum = cleanNumeroListado(lista || id, lineaNombre);

      // Corrección de error de captura en ERP: 26802 viene con 03/08/2027 cuando fue operado en 2026
      let fechaLimpia = fecha || '01/01/2025';
      if (cleanNum === '26802' || fechaLimpia.includes('/2027')) {
        fechaLimpia = fechaLimpia.replace('/2027', '/2026');
      }

      listadosMap.set(id, {
        id,
        lineaNombre,
        numeroListado: cleanNum,
        fechaRequeridaStr: fechaLimpia,
      });
    }
  }
  console.log(`📋 Consulta_01: ${listadosMap.size} listados base catalogados.`);

  // 5. Leer Consulta_02 a Consulta_06 (Eventos de estatus y fechas)
  const eventsById = new Map<string, Map<string, string>>();
  const allEncounteredIds = new Set<string>();

  const statusFiles = [
    'Consulta_02.txt',
    'Consulta_03.txt',
    'Consulta_04.txt',
    'Consulta_05.txt',
    'Consulta_06.txt',
  ];

  for (const fileName of statusFiles) {
    const filePath = path.join(DEFAULT_HISTORICO_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Archivo no encontrado: ${fileName}, omitiendo...`);
      continue;
    }
    const raw = fs.readFileSync(filePath, 'latin1');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

    for (let i = 1; i < lines.length; i++) {
      const currentStatusLine = lines[i];
      if (!currentStatusLine) continue;
      const [id, estatus, fecha] = currentStatusLine.split('\t');
      const tId = id?.trim();
      const tEst = estatus?.trim();
      const tFec = fecha?.trim();

      if (tId && !tId.startsWith('x') && tId !== 'LINEA / MAQ LISTA') {
        allEncounteredIds.add(tId);
        if (!eventsById.has(tId)) {
          eventsById.set(tId, new Map());
        }
        if (tEst) {
          eventsById.get(tId)!.set(tEst, tFec || '');
        }
      }
    }
  }
  console.log(`📊 Consulta_02 a 06: ${allEncounteredIds.size} listados únicos con eventos registrados.`);

  // 6. Incorporar listados que están en los archivos de estatus pero que ya salieron de Consulta_01 (histórico antiguo)
  for (const id of allEncounteredIds) {
    if (!listadosMap.has(id)) {
      // Deducir línea y número
      const matchedLine = KNOWN_LINEAS_FALLBACK.find((l) => id.startsWith(`${l} `));
      let lineaNombre = 'BOTA';

      if (matchedLine) {
        lineaNombre = matchedLine;
      }

      const cleanNum = cleanNumeroListado(id, lineaNombre);

      // Buscar una fecha representativa en sus eventos
      const evMap = eventsById.get(id);
      let fechaStr = '30/08/2024';
      if (evMap) {
        for (const f of evMap.values()) {
          if (f) {
            fechaStr = f;
            break;
          }
        }
      }

      listadosMap.set(id, {
        id,
        lineaNombre,
        numeroListado: cleanNum,
        fechaRequeridaStr: fechaStr,
      });
    }
  }

  console.log(`📦 Universo consolidado: ${listadosMap.size} listados listos para procesar.`);

  // Detectar y resolver colisiones cruzadas de números idénticos en distintas líneas
  const numeroCounts = new Map<string, number>();
  for (const item of listadosMap.values()) {
    numeroCounts.set(item.numeroListado, (numeroCounts.get(item.numeroListado) || 0) + 1);
  }

  // 7. Procesar e insertar / actualizar en lotes
  let insertados = 0;
  let omitidos = 0;
  const BATCH_SIZE = 100;
  const items = Array.from(listadosMap.values());

  for (let b = 0; b < items.length; b += BATCH_SIZE) {
    const chunk = items.slice(b, b + BATCH_SIZE);

    for (const item of chunk) {
      // Resolver línea de producción
      const normalizedLineName = item.lineaNombre.trim().toUpperCase();
      const lineaInfo = lineaMap.get(normalizedLineName) || lineaMap.get('BOTA');
      if (!lineaInfo) {
        omitidos++;
        continue;
      }

      // Resolver frentes correspondientes según la línea
      const isBolsaLinea = normalizedLineName === 'BOLSAS' || normalizedLineName === 'BOLSA';
      const requiredFrentes: Array<'DIRECTOS' | 'INDIRECTOS' | 'BOLSAS'> = isBolsaLinea
        ? ['DIRECTOS', 'INDIRECTOS', 'BOLSAS']
        : ['DIRECTOS', 'INDIRECTOS'];

      // Evaluar estatus de cada frente
      const evMap = eventsById.get(item.id) || new Map<string, string>();

      // Obtener una fecha válida de eventos para fallback de fechas corruptas
      let validEventDateStr: string | undefined = undefined;
      for (const f of evMap.values()) {
        if (f && f.includes('/20')) {
          validEventDateStr = f;
          break;
        }
      }

      const frentesData = requiredFrentes.map((frente) => {
        const hasDescontado = evMap.has(`DESCONTADO ${frente}`);
        const hasEntregado = evMap.has(`ENTREGADO ${frente}`);
        const hasSeparado = evMap.has(`SEPARADO ${frente}`);

        let estadoFrente: 'PENDIENTE' | 'SEPARADO' | 'ENTREGADO' | 'DESCONTADO' = 'PENDIENTE';
        let fechaSeparado: Date | null = null;
        let fechaEntregado: Date | null = null;
        let fechaDescontado: Date | null = null;

        if (hasDescontado) {
          estadoFrente = 'DESCONTADO';
          fechaDescontado = parseDate(evMap.get(`DESCONTADO ${frente}`), validEventDateStr);
          fechaEntregado = parseDate(evMap.get(`ENTREGADO ${frente}`) || evMap.get(`DESCONTADO ${frente}`), validEventDateStr);
          fechaSeparado = parseDate(evMap.get(`SEPARADO ${frente}`) || evMap.get(`DESCONTADO ${frente}`), validEventDateStr);
        } else if (hasEntregado) {
          estadoFrente = 'ENTREGADO';
          fechaEntregado = parseDate(evMap.get(`ENTREGADO ${frente}`), validEventDateStr);
          fechaSeparado = parseDate(evMap.get(`SEPARADO ${frente}`) || evMap.get(`ENTREGADO ${frente}`), validEventDateStr);
        } else if (hasSeparado) {
          estadoFrente = 'SEPARADO';
          fechaSeparado = parseDate(evMap.get(`SEPARADO ${frente}`), validEventDateStr);
        }

        return {
          tipoFrente: frente,
          estado: estadoFrente,
          separadoPorId: fechaSeparado ? defaultUserId : null,
          fechaSeparado,
          entregadoPorId: fechaEntregado ? defaultUserId : null,
          fechaEntregado,
          descontadoPorId: fechaDescontado ? defaultUserId : null,
          fechaDescontado,
        };
      });

      const fechaRequerida = parseDate(item.fechaRequeridaStr, validEventDateStr);
      const anioRequerido = fechaRequerida.getFullYear();

      // Regla de depuración histórica: listados de 2024 y 2025 se marcan directamente como DESCONTADO
      if (anioRequerido < 2026) {
        for (const f of frentesData) {
          f.estado = 'DESCONTADO';
          if (!f.fechaSeparado) f.fechaSeparado = fechaRequerida;
          if (!f.separadoPorId) f.separadoPorId = defaultUserId;
          if (!f.fechaEntregado) f.fechaEntregado = fechaRequerida;
          if (!f.entregadoPorId) f.entregadoPorId = defaultUserId;
          if (!f.fechaDescontado) f.fechaDescontado = fechaRequerida;
          if (!f.descontadoPorId) f.descontadoPorId = defaultUserId;
        }
      }

      // Calcular estado global del listado
      const estadosFrentes = frentesData.map((f) => f.estado);
      const globalEstado = (() => {
        if (estadosFrentes.every((s) => s === 'DESCONTADO')) return 'DESCONTADO';
        if (estadosFrentes.every((s) => s === 'ENTREGADO' || s === 'DESCONTADO')) return 'ENTREGADO_A_PRODUCCION';
        if (estadosFrentes.every((s) => s === 'SEPARADO' || s === 'ENTREGADO' || s === 'DESCONTADO')) return 'SEPARADO';
        if (estadosFrentes.some((s) => s !== 'PENDIENTE')) return 'EN_PROCESO';
        return 'PENDIENTE';
      })();

      // Si el número de listado limpio es 100% único, se guarda como tal (ej: "25151").
      // Si existiese colisión entre dos líneas distintas (ej: "26661" en CINTOS y BOTA), se desambigua con su línea.
      const isColliding = (numeroCounts.get(item.numeroListado) || 0) > 1;
      const numeroListadoAGuardar = isColliding ? item.id : item.numeroListado;

      // Inserción / Actualización idempotente
      await prisma.listadoMaterial.upsert({
        where: { numeroListado: numeroListadoAGuardar },
        update: {
          estado: globalEstado,
          fechaRequerida,
          lineaProduccionId: lineaInfo.id,
          departamentoId: lineaInfo.departamentoId,
          frentes: {
            deleteMany: {},
            create: frentesData.map((f) => ({
              tipoFrente: f.tipoFrente,
              estado: f.estado,
              separadoPorId: f.separadoPorId,
              fechaSeparado: f.fechaSeparado,
              entregadoPorId: f.entregadoPorId,
              fechaEntregado: f.fechaEntregado,
              descontadoPorId: f.descontadoPorId,
              fechaDescontado: f.fechaDescontado,
            })),
          },
        },
        create: {
          numeroListado: numeroListadoAGuardar,
          fechaRequerida,
          departamentoId: lineaInfo.departamentoId,
          lineaProduccionId: lineaInfo.id,
          estado: globalEstado,
          creadoPorUsuarioId: defaultUserId,
          frentes: {
            create: frentesData.map((f) => ({
              tipoFrente: f.tipoFrente,
              estado: f.estado,
              separadoPorId: f.separadoPorId,
              fechaSeparado: f.fechaSeparado,
              entregadoPorId: f.entregadoPorId,
              fechaEntregado: f.fechaEntregado,
              descontadoPorId: f.descontadoPorId,
              fechaDescontado: f.fechaDescontado,
            })),
          },
        },
      });

      insertados++;
    }

    process.stdout.write(`\rProcesados: ${insertados} de ${items.length}...`);
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('✅ IMPORTACIÓN COMPLETADA CON ÉXITO');
  console.log(`📦 Total listados sincronizados: ${insertados}`);
  if (omitidos > 0) console.log(`⚠️ Omitidos por inconsistencia: ${omitidos}`);

  const totalEnBd = await prisma.listadoMaterial.count();
  console.log(`📊 Total listados actuales en BD: ${totalEnBd}`);
  console.log('='.repeat(70));
}

export async function syncHistorico(options?: { clean?: boolean }): Promise<void> {
  if (options?.clean && !process.argv.includes('--clean')) {
    process.argv.push('--clean');
  }
  await run();
}

// Ejecución directa por CLI: bun scripts/sync-historico.ts
if (import.meta.main) {
  run()
    .catch((err) => {
      console.error('❌ Error fatal durante la importación:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

