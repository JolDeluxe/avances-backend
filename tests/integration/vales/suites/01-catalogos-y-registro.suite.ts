import { describe, expect, test } from "bun:test";
import { prisma } from "../../../../src/config/database";
import type { ValesTestContext } from "../helpers/test-harness";

export function registerCatalogosYRegistroSuite(getCtx: () => ValesTestContext): void {
  describe("01. Catálogos, Registro, Excepción B7 y Concurrencia (T01-T06 + H6)", () => {
    test("T01: Consulta de catálogos sembrados en MATERIA_PRIMA (6 series, 52 deptos) y filtrado de inactivos", async () => {
      const ctx = getCtx();

      // Catálogo real de MATERIA_PRIMA consultado por SUPER_ADMIN (solo lectura)
      const resReal = await ctx.apiRequest(
        "GET",
        `/vales/catalogos?departamentoId=${ctx.deptoRealMPId}`,
        ctx.users.superAdmin.token,
      );
      expect(resReal.status).toBe(200);
      expect(resReal.json.data.series.length).toBeGreaterThanOrEqual(6);
      expect(resReal.json.data.departamentosVale.length).toBeGreaterThanOrEqual(52);

      // Catálogo del departamento aislado de pruebas consultado por REGISTRADOR
      const resTest = await ctx.apiRequest(
        "GET",
        "/vales/catalogos",
        ctx.users.registrador.token,
      );
      expect(resTest.status).toBe(200);
      // No debe incluir SRINACT ni DEPTO INACTIVO
      const codigosSeries = resTest.json.data.series.map((s: any) => s.codigo);
      const codigosDeptos = resTest.json.data.departamentosVale.map((d: any) => d.codigo);
      expect(codigosSeries).toContain("KABTM");
      expect(codigosSeries).not.toContain("SRINACT");
      expect(codigosDeptos).toContain("BOT CORTE");
      expect(codigosDeptos).not.toContain("DEPTO INACTIVO");
    });

    test("T02: Registro de vale normal (BOT CORTE -> área BOTA automática, fecha sin hora a 12:00Z)", async () => {
      const ctx = getCtx();
      const res = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: " 1008 ",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });

      ctx.trackVale(res.json.data?.id);
      expect(res.status).toBe(201);
      expect(res.json.data.serie.codigo).toBe("KABTM");
      expect(res.json.data.folio).toBe("1008");
      expect(res.json.data.area).toBe("BOTA");
      expect(res.json.data.tieneHoraSolicitud).toBe(false);
      expect(res.json.data.fechaSolicitud).toBe("2025-10-10T12:00:00.000Z");
      expect(res.json.data.estado).toBe("PENDIENTE");
    });

    test("T03: Permitir Serie + Folio duplicado con ID distinto y fecha con hora opcional", async () => {
      const ctx = getCtx();
      const res1 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "1008",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(res1.json.data?.id);

      const res2 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "1008",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-11",
        horaSolicitud: "14:35",
      });
      ctx.trackVale(res2.json.data?.id);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res2.json.data.id).not.toBe(res1.json.data.id);
      expect(res2.json.data.folio).toBe("1008");
      expect(res2.json.data.tieneHoraSolicitud).toBe(true);
      expect(res2.json.data.fechaSolicitud).toBe("2025-10-11T14:35:00.000Z");
    });

    test("T04: Excepción B7 rechaza con 400 si no se especifica área", async () => {
      const ctx = getCtx();
      const res = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "B7-FAIL",
        departamentoValeId: ctx.catalogs.deptoB7Corte.id,
        fechaSolicitud: "2025-10-10",
      });
      expect(res.status).toBe(400);
    });

    test("T05: Excepción B7 permite clasificar cada vale individualmente (BOTA vs ACCESORIOS)", async () => {
      const ctx = getCtx();
      const resBota = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "B7-BOTA-01",
        departamentoValeId: ctx.catalogs.deptoB7Corte.id,
        area: "BOTA",
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(resBota.json.data?.id);

      const resAcc = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKAACM.id,
        folio: "B7-ACC-01",
        departamentoValeId: ctx.catalogs.deptoB7Corte.id,
        area: "ACCESORIOS",
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(resAcc.json.data?.id);

      expect(resBota.status).toBe(201);
      expect(resBota.json.data.area).toBe("BOTA");
      expect(resAcc.status).toBe(201);
      expect(resAcc.json.data.area).toBe("ACCESORIOS");

      // Verificar que B7 CORTE conserve areaFija === null en el catálogo
      const b7Db = await prisma.departamentoVale.findUniqueOrThrow({
        where: { id: ctx.catalogs.deptoB7Corte.id },
      });
      expect(b7Db.areaFija).toBeNull();
      expect(b7Db.requiereSeleccionArea).toBe(true);
    });

    test("T06: Alta dinámica y normalización de nueva Serie y nuevo Departamento Operativo", async () => {
      const ctx = getCtx();
      const res = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        nuevaSerie: "   sr_dyn 01  ",
        folio: "9001",
        nuevoDepartamento: "  depto   dinamico   especial ",
        area: "OTRO",
        fechaSolicitud: "2025-10-10",
      });

      ctx.trackVale(res.json.data?.id);
      ctx.trackSerie(res.json.data?.serieId);
      ctx.trackDeptoVale(res.json.data?.departamentoValeId);

      expect(res.status).toBe(201);
      expect(res.json.data.serie.codigo).toBe("SR_DYN 01");
      expect(res.json.data.departamentoVale.nombre).toBe("DEPTO DINAMICO ESPECIAL");
      expect(res.json.data.departamentoVale.areaFija).toBe("OTRO");
      expect(res.json.data.area).toBe("OTRO");
    });

    test("H6-A: Reutilizar un catálogo activo en nuevaSerie/nuevoDepartamento no altera su areaFija ni esSistema", async () => {
      const ctx = getCtx();
      // BOT CORTE tiene areaFija="BOTA" y esSistema=true. Si el usuario escribe nuevoDepartamento="bot  corte" y area="OTRO",
      // debe reutilizar BOT CORTE sin cambiar su areaFija, asignando area="BOTA" al vale.
      const res = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        nuevaSerie: "  kabtm ",
        folio: "REUSE-01",
        nuevoDepartamento: " bot   corte ",
        area: "OTRO",
        fechaSolicitud: "2025-10-10",
      });

      ctx.trackVale(res.json.data?.id);
      expect(res.status).toBe(201);
      expect(res.json.data.serieId).toBe(ctx.catalogs.serieKABTM.id);
      expect(res.json.data.departamentoValeId).toBe(ctx.catalogs.deptoBotCorte.id);
      expect(res.json.data.area).toBe("BOTA");

      const deptoDb = await prisma.departamentoVale.findUniqueOrThrow({
        where: { id: ctx.catalogs.deptoBotCorte.id },
      });
      expect(deptoDb.areaFija).toBe("BOTA");
      expect(deptoDb.esSistema).toBe(true);
    });

    test("H6-B: Un registrador NO puede reactivar ni usar una serie o departamento INACTIVO", async () => {
      const ctx = getCtx();

      // 1. Intentar usar serieInactiva por nuevaSerie
      const resSerieInact = await ctx.apiRequest(
        "POST",
        "/vales",
        ctx.users.registrador.token,
        {
          nuevaSerie: " srinact ",
          folio: "INACT-1",
          departamentoValeId: ctx.catalogs.deptoBotCorte.id,
          fechaSolicitud: "2025-10-10",
        },
      );
      expect(resSerieInact.status).toBe(400);

      const serieDb = await prisma.serieVale.findUniqueOrThrow({
        where: { id: ctx.catalogs.serieInactiva.id },
      });
      expect(serieDb.estado).toBe("INACTIVO");

      // 2. Intentar usar deptoInactivo por nuevoDepartamento
      const resDeptoInact = await ctx.apiRequest(
        "POST",
        "/vales",
        ctx.users.registrador.token,
        {
          serieId: ctx.catalogs.serieKABTM.id,
          folio: "INACT-2",
          nuevoDepartamento: " depto  inactivo ",
          area: "BOTA",
          fechaSolicitud: "2025-10-10",
        },
      );
      expect(resDeptoInact.status).toBe(400);

      const deptoDb = await prisma.departamentoVale.findUniqueOrThrow({
        where: { id: ctx.catalogs.deptoInactivo.id },
      });
      expect(deptoDb.estado).toBe("INACTIVO");
    });

    test("H6-C: Solicitudes simultáneas (Promise.all) creando el mismo catálogo nuevo manejan P2002 sin duplicar ni fallar", async () => {
      const ctx = getCtx();
      const codigoSerieConc = `SCONC_${ctx.runId}`.slice(0, 18);
      const nombreDeptoConc = `DEPTO CONC ${ctx.runId}`;

      const peticionesSimultaneas = Array.from({ length: 5 }, (_, idx) =>
        ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
          nuevaSerie: `  ${codigoSerieConc.toLowerCase()} `,
          folio: `CONC-${idx + 1}`,
          nuevoDepartamento: `  ${nombreDeptoConc.toLowerCase()} `,
          area: "ACCESORIOS",
          fechaSolicitud: "2025-10-10",
        }),
      );

      const respuestas = await Promise.all(peticionesSimultaneas);

      for (const r of respuestas) {
        ctx.trackVale(r.json.data?.id);
        ctx.trackSerie(r.json.data?.serieId);
        ctx.trackDeptoVale(r.json.data?.departamentoValeId);
        expect(r.status).toBe(201);
      }

      const serieIds = new Set(respuestas.map((r) => r.json.data.serieId));
      const deptoIds = new Set(respuestas.map((r) => r.json.data.departamentoValeId));
      expect(serieIds.size).toBe(1);
      expect(deptoIds.size).toBe(1);
    });

    test("H6-D: Rechaza ambigüedad al enviar serieId + nuevaSerie o departamentoValeId + nuevoDepartamento", async () => {
      const ctx = getCtx();
      const resAmbiguo = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        nuevaSerie: "OTRASERIE",
        folio: "AMB-01",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      expect(resAmbiguo.status).toBe(400);
    });
  });
}
