import { prisma } from "../src/config/database";

const raw = `936	BOTA LAG 25L31	BOTA LAG	25L31	07/07/2025	14
937	BILLETERAS L.P 30102	BILLETERAS	L.P 30102	01/07/2025	23
938	BILLETERAS 25W26	BILLETERAS	25W26	02/07/2025	23
939	CINTOS 25770	CINTOS	25770	01/07/2025	21
940	CINTOS 25771	CINTOS	25771	02/07/2025	21
941	BOLSAS 25B50	BOLSAS	25B50	02/07/2025	99
942	BOTA 25129	BOTA	25129	01/07/2025	11
943	BOTA LAG 25L32	BOTA LAG	25L32	08/07/2025	14
944	BOTA FAC 25F30	BOTA FAC	25F30	07/07/2025	13
945	CINTOS L.P 10153.54.55.56	CINTOS	L.P 10153.54.55.56	01/07/2025	21
946	BOLSAS 25B51	BOLSAS	25B51	02/07/2025	99
947	CHAMARRAS 25J42	CHAMARRAS	25J42	02/07/2025	24
948	BOTA 25130	BOTA	25130	02/07/2025	11
949	BOLSAS L.P 40148	BOLSAS	L.P 40148	02/07/2025	99
950	CINTOS 25772	CINTOS	25772	03/07/2025	21
951	CINTOS MAQ 25773	CINTOS MAQ	25773	04/07/2025	22
952	CINTOS 25774	CINTOS	25774	04/07/2025	21
953	CINTOS 25775	CINTOS	25775	05/07/2025	21
954	CINTOS 25776	CINTOS	25776	07/07/2025	21
955	CINTOS 25777	CINTOS	25777	08/07/2025	21
956	BOTA 25131	BOTA	25131	03/07/2025	11
957	BOTA 25132	BOTA	25132	04/07/2025	11
958	BOTA 25133	BOTA	25133	07/07/2025	11
959	BOTA 25134	BOTA	25134	05/07/2025	11
960	CHAMARRAS 25J43	CHAMARRAS	25J43	04/07/2025	24
961	BETA 7 25A41	BETA 7	25A41	04/07/2025	25
962	BETA 7 25A43	BETA 7	25A43	11/07/2025	25
963	BOLSAS 25B52	BOLSAS	25B52	09/07/2025	99
964	CINTOS L.P 10157	CINTOS	L.P 10157	07/07/2025	21
965	CHAMARRAS L.P 10398	CHAMARRAS	L.P 10398	07/07/2025	24
966	BILLETERAS 25W27	BILLETERAS	25W27	09/07/2025	23
967	BOTA 25135	BOTA	25135	08/07/2025	11
968	BOTA 25136	BOTA	25136	09/07/2025	11
969	BOTA FAC 25F31	BOTA FAC	25F31	14/07/2025	13
970	BOTA LAG 25L33	BOTA LAG	25L33	14/07/2025	14
971	CHAMARRAS L.P 10398	CHAMARRAS	L.P 10398	08/07/2025	24
972	CINTOS 25778	CINTOS	25778	09/07/2025	21
973	CINTOS 25779	CINTOS	25779	10/07/2025	21
974	CINTOS MAQ 25780	CINTOS MAQ	25780	11/07/2025	22
975	CINTOS 25781	CINTOS	25781	11/07/2025	21
976	CHAMARRAS 25J44	CHAMARRAS	25J44	09/07/2025	24
977	CINTOS 25783	CINTOS	25783	14/07/2025	21
978	CINTOS 25784	CINTOS	25784	15/07/2025	21
979	CINTOS MAQ 25787	CINTOS MAQ	25787	18/07/2025	22
980	BOTA 25137	BOTA	25137	10/07/2025	11
981	BOTA 25138	BOTA	25138	11/07/2025	11
982	BOTA 25139	BOTA	25139	14/07/2025	11
983	BOTA 25140	BOTA	25140	15/07/2025	11
984	BOTA 25141	BOTA	25141	16/07/2025	11
985	CHAMARRAS 25J45	CHAMARRAS	25J45	10/07/2025	24
986	BETA 7 25A44	BETA 7	25A44	14/07/2025	25
987	BETA 7 25A45	BETA 7	25A45	14/07/2025	25
988	BETA 7 25A46	BETA 7	25A46	14/07/2025	25
989	BOLSAS L.P 40149	BOLSAS	L.P 40149	14/07/2025	99
990	BOLSAS 25B53	BOLSAS	25B53	16/07/2025	99
991	CHAMARRAS 25J46	CHAMARRAS	25J46	16/07/2025	24
992	BOTA LAG 25L34	BOTA LAG	25L34	21/07/2025	14
993	BOTA FAC 25F32	BOTA FAC	25F32	21/07/2025	13
994	CINTOS 25785	CINTOS	25785	16/07/2025	21
995	CINTOS 25786	CINTOS	25786	17/07/2025	21
996	CINTOS 25788	CINTOS	25788	18/07/2025	21
997	CINTOS 25789	CINTOS	25789	19/07/2025	21
998	CINTOS 25790	CINTOS	25790	21/07/2025	21
999	CINTOS 25791	CINTOS	25791	22/07/2025	21
1000	BOLSAS 25B54	BOLSAS	25B54	16/07/2025	99
1001	BILLETERAS 25W28	BILLETERAS	25W28	14/07/2025	23
1002	BOTA 25142	BOTA	25142	17/07/2025	11
1003	CHAMARRAS 10399	CHAMARRAS	10399	16/07/2025	24
1004	BOTA 25143	BOTA	25143	18/07/2025	11
1005	BETA 7 25A47	BETA 7	25A47	18/07/2025	25
1006	BETA 7 25A48	BETA 7	25A48	18/07/2025	25
1007	BOLSAS 25B55	BOLSAS	25B55	23/07/2025	99
1008	BOTA 25144	BOTA	25144	21/07/2025	11
1009	BILLETERAS 25W29	BILLETERAS	25W29	23/07/2025	23
1010	BOTA FAC 25F33	BOTA FAC	25F33	28/07/2025	13
1011	BOTA LAG 25L35	BOTA LAG	25L35	28/07/2025	14
1012	BOLSAS 25B56	BOLSAS	25B56	23/07/2025	99
1013	CHAMARRAS L.P 10400	CHAMARRAS	L.P 10400	21/07/2025	24
1014	BOTA 25146	BOTA	25146	23/07/2025	11
1015	BOTA 25145	BOTA	25145	22/07/2025	11
81	CHAMARRAS 25J47	CHAMARRAS	25J47	23/07/2025	24
82	CINTOS 25792	CINTOS	25792	23/07/2025	21
83	CINTOS 25793	CINTOS	25793	24/07/2025	21
84	BOLSAS L.P 40150	BOLSAS	L.P 40150	22/07/2025	99
85	BOTA 25147	BOTA	25147	24/07/2025	11
86	CINTOS MAQ 25795	CINTOS MAQ	25795	25/07/2025	22
87	CINTOS 25794	CINTOS	25794	25/07/2025	21
88	CINTOS 25796	CINTOS	25796	26/07/2025	21
89	CINTOS 25797	CINTOS	25797	28/07/2025	21
90	BETA 7 25A49	BETA 7	25A49	25/07/2025	25
91	BOTA 25148	BOTA	25148	25/07/2025	11
92	BETA 7 25A50	BETA 7	25A50	25/07/2025	25
93	BOTA 25149	BOTA	25149	28/07/2025	11
94	CHAMARRAS 25J48	CHAMARRAS	25J48	28/07/2025	24
95	BILLETERAS 25W30	BILLETERAS	25W30	30/07/2025	23
96	CINTOS 25798	CINTOS	25798	29/07/2025	21
97	BOLSAS 25B57	BOLSAS	25B57	30/07/2025	99
98	BOTA 25150	BOTA	25150	29/07/2025	11
99	BETA 7 25A51	BETA 7	25A51	29/07/2025	25
100	CINTOS 25799	CINTOS	25799	30/07/2025	21
101	CINTOS 25800	CINTOS	25800	31/07/2025	21
102	CHAMARRAS 25J49	CHAMARRAS	25J49	30/07/2025	24
103	BOTA 25151	BOTA	25151	01/07/300	11
104	BOTA 25152	BOTA	25152	31/07/2025	11
105	BOTA LAG 25L36	BOTA LAG	25L36	04/08/2025	14
106	BOTA FAC 25F34	BOTA FAC	25F34	04/08/2025	13
107	CINTOS 25801	CINTOS	25801	01/08/2025	21
108	CINTOS 25803	CINTOS	25803	02/08/2025	21
109	CINTOS 25804	CINTOS	25804	04/08/2025	21
110	CINTOS 25805	CINTOS	25805	05/08/2025	21
111	BOLSAS 25B58	BOLSAS	25B58	01/08/2025	99
112	CINTOS MAQ 25802	CINTOS MAQ	25802	01/08/2025	22
113	BOTA 25153	BOTA	25153	01/08/2025	11
114	BETA 7 25A52	BETA 7	25A52	01/08/2025	25
115	BETA 7 25A53	BETA 7	25A53	01/08/2025	25
116	BETA 7 25A54	BETA 7	25A54	01/08/2025	25
117	BOTA 25154	BOTA	25154	04/08/2025	11
118	BOTA LAG 25L37	BOTA LAG	25L37	11/08/2025	14
119	BILLETERAS 25W31	BILLETERAS	25W31	06/08/2025	23`;

// Definición de las 9 líneas con su código normalizado y nombre
const LINEAS_DEFINICION = [
  { codigo: "BOTA_LAG", nombre: "BOTA LAG", label: "Línea Bota Lagunera" },
  { codigo: "BILLETERAS", nombre: "BILLETERAS", label: "Línea Billeteras" },
  { codigo: "CINTOS", nombre: "CINTOS", label: "Línea Cintos" },
  { codigo: "BOLSAS", nombre: "BOLSAS", label: "Línea Bolsas" },
  { codigo: "BOTA", nombre: "BOTA", label: "Línea Bota" },
  { codigo: "BOTA_FAC", nombre: "BOTA FAC", label: "Línea Bota Factory" },
  { codigo: "CHAMARRAS", nombre: "CHAMARRAS", label: "Línea Chamarras" },
  { codigo: "CINTOS_MAQ", nombre: "CINTOS MAQ", label: "Línea Cintos Maquila" },
  { codigo: "BETA_7", nombre: "BETA 7", label: "Línea Beta 7" },
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
    default: return nombreLinea.replace(/\s+/g, "_");
  }
}

function parseFecha(fechaStr: string): Date {
  const [diaStr, mesStr, anioStr] = fechaStr.split("/");
  const dia = parseInt(diaStr, 10);
  const mes = parseInt(mesStr, 10) - 1; // 0-indexed
  let anio = parseInt(anioStr, 10);
  if (anio < 1000) {
    // Caso de error tipográfico ej. 300 -> 2025
    anio = 2025;
  }
  return new Date(Date.UTC(anio, mes, dia));
}

async function run() {
  console.log("=== INICIANDO SINCRONIZACIÓN DE LÍNEAS Y LISTADOS ===");

  // 1. Obtener departamento MATERIA_PRIMA
  const deptoMP = await prisma.departamento.findUnique({
    where: { codigo: "MATERIA_PRIMA" },
  });

  if (!deptoMP) {
    throw new Error("Departamento MATERIA_PRIMA no encontrado");
  }

  // 2. Obtener usuario admin / creador
  const usuarioCreador = await prisma.usuario.findFirst({
    where: { estado: "ACTIVO" },
    orderBy: { id: "asc" },
  });

  if (!usuarioCreador) {
    throw new Error("No hay usuario activo para asignar creador");
  }

  // 3. Crear / Actualizar las 9 líneas en la BD
  console.log("Sincronizando 9 líneas en departamento MATERIA_PRIMA...");
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
    console.log(` Línea lista: [${def.codigo}] ID=${linea.id} Nombre="${def.nombre}"`);
  }

  // También asegurar compatibilidad si existían BOLSA o CHAMARRA
  const bolsaExistente = await prisma.lineaProduccion.findUnique({ where: { codigo: "BOLSA" } });
  if (bolsaExistente) lineasMap.set("BOLSA", bolsaExistente.id);

  // 4. Procesar los 119 listados
  console.log("\nProcesando los 119 listados...");
  const lineasRaw = raw.trim().split("\n");
  let creados = 0;
  let actualizados = 0;

  for (const row of lineasRaw) {
    const parts = row.split("\t");
    if (parts.length < 5) continue;
    const [, , lineaStr, listaStr, fechaStr] = parts;
    const lineaNombre = lineaStr.trim();
    const numeroListado = listaStr.trim();
    const codigoLinea = mapearNombreACodigo(lineaNombre);
    const lineaId = lineasMap.get(codigoLinea);

    if (!lineaId) {
      console.warn(`Línea no encontrada para: ${lineaNombre}`);
      continue;
    }

    const fechaRequerida = parseFecha(fechaStr.trim());

    // Crear o actualizar listado por numeroListado
    const listadoExistente = await prisma.listadoMaterial.findUnique({
      where: { numeroListado },
    });

    if (listadoExistente) {
      await prisma.listadoMaterial.update({
        where: { id: listadoExistente.id },
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
  }

  console.log(`\nSincronización completada:`);
  console.log(` - Listados creados: ${creados}`);
  console.log(` - Listados actualizados: ${actualizados}`);
  console.log(` - Total listados procesados: ${creados + actualizados}`);
}

run()
  .catch((e) => {
    console.error("Error en sincronización:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
