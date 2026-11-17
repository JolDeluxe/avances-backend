import { describe, expect, test } from "bun:test";
import { prisma } from "../../../../src/config/database";
import type { ValesTestContext } from "../helpers/test-harness";

export function registerAlcanceSeguridadYContadoresSuite(getCtx: () => ValesTestContext): void {
  describe("03. Alcance Operativo, Anti-Evasión scopeView, Seguridad y Contadores (T08, T09, T17, T18 + H1 + H8)", () => {
    test("T08 + H1-A: Almacenista sin autorizaciones (Deny-by-default) ve 0 vales y 0 en contadores con cualquier scopeView (almacen, general, registrar, descontar o sin scopeView)", async () => {
      const ctx = getCtx();

      const vistas = [
        "/vales",
        "/vales?scopeView=almacen",
        "/vales?scopeView=general",
        "/vales?scopeView=registrar",
        "/vales?scopeView=descontar",
        "/vales?scopeView=auditoria",
      ];

      for (const url of vistas) {
        const res = await ctx.apiRequest("GET", url, ctx.users.almVacio.token);
        expect(res.status).toBe(200);
        expect(res.json.data.total).toBe(0);
        expect(res.json.data.items.length).toBe(0);
        expect(res.json.data.conteosPorEstado).toEqual({
          PENDIENTE: 0,
          SEPARADO: 0,
          ENTREGADO: 0,
          DESCONTADO: 0,
          CANCELADO: 0,
        });
        expect(res.json.data.conteosPorArea).toEqual({
          BOTA: 0,
          ACCESORIOS: 0,
          OTRO: 0,
        });
      }
    });

    test("T09 + H1-B: Alcance acumulativo (Área BOTA U Depto CIN CORTE), bloqueo de evasión por scopeView y validación en getValeById", async () => {
      const ctx = getCtx();

      // Crear 3 vales con prefijo único para esta prueba:
      // 1) B7 CORTE clasificado como BOTA (autorizado por área BOTA)
      const vB7Bota = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "SC-B7BOTA",
        departamentoValeId: ctx.catalogs.deptoB7Corte.id,
        area: "BOTA",
        fechaSolicitud: "2025-10-12",
      });
      ctx.trackVale(vB7Bota.json.data?.id);

      // 2) CIN CORTE (ACCESORIOS, pero autorizado por departamento individual CIN CORTE)
      const vCinCorte = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKAACM.id,
        folio: "SC-CINCOR",
        departamentoValeId: ctx.catalogs.deptoCinCorte.id,
        fechaSolicitud: "2025-10-12",
      });
      ctx.trackVale(vCinCorte.json.data?.id);

      // 3) CIN ADORNO (ACCESORIOS, NO autorizado para almBotaMasCinCorte)
      const vCinAdorno = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKAACM.id,
        folio: "SC-CINADO",
        departamentoValeId: ctx.catalogs.deptoCinAdorno.id,
        fechaSolicitud: "2025-10-12",
      });
      ctx.trackVale(vCinAdorno.json.data?.id);

      // 1. Verificar que almBotaMasCinCorte no ve SC-CINADO ni siquiera cambiando scopeView=general o omitiéndolo
      for (const query of ["?busqueda=SC-", "?busqueda=SC-&scopeView=general", "?busqueda=SC-&scopeView=registrar"]) {
        const resList = await ctx.apiRequest(
          "GET",
          `/vales${query}`,
          ctx.users.almBotaMasCinCorte.token,
        );
        expect(resList.status).toBe(200);
        const folios = resList.json.data.items.map((i: any) => i.folio);
        expect(folios).toContain("SC-B7BOTA");
        expect(folios).toContain("SC-CINCOR");
        expect(folios).not.toContain("SC-CINADO");
      }

      // 2. Verificar que getValeById bloquea con 403 cuando almBotaMasCinCorte intenta ver el detalle de SC-CINADO
      const resDetailBlocked = await ctx.apiRequest(
        "GET",
        `/vales/${vCinAdorno.json.data.id}`,
        ctx.users.almBotaMasCinCorte.token,
      );
      expect(resDetailBlocked.status).toBe(403);

      // Pero sí puede ver el detalle de SC-B7BOTA y SC-CINCOR
      const resDetailOk1 = await ctx.apiRequest(
        "GET",
        `/vales/${vB7Bota.json.data.id}`,
        ctx.users.almBotaMasCinCorte.token,
      );
      const resDetailOk2 = await ctx.apiRequest(
        "GET",
        `/vales/${vCinCorte.json.data.id}`,
        ctx.users.almBotaMasCinCorte.token,
      );
      expect(resDetailOk1.status).toBe(200);
      expect(resDetailOk2.status).toBe(200);

      // 3. Verificar que separar SC-CINADO da 403, mientras que separar SC-B7BOTA y SC-CINCOR da 200
      const resSepDenied = await ctx.apiRequest(
        "POST",
        `/vales/${vCinAdorno.json.data.id}/separar`,
        ctx.users.almBotaMasCinCorte.token,
        {},
      );
      const resSepOk1 = await ctx.apiRequest(
        "POST",
        `/vales/${vB7Bota.json.data.id}/separar`,
        ctx.users.almBotaMasCinCorte.token,
        {},
      );
      const resSepOk2 = await ctx.apiRequest(
        "POST",
        `/vales/${vCinCorte.json.data.id}/separar`,
        ctx.users.almBotaMasCinCorte.token,
        {},
      );
      expect(resSepDenied.status).toBe(403);
      expect(resSepOk1.status).toBe(200);
      expect(resSepOk2.status).toBe(200);
    });

    test("H8: conteosPorEstado aplica filtros activos excepto estado, y conteosPorArea aplica filtros activos excepto area", async () => {
      const ctx = getCtx();
      const tag = "CNT88";

      // Crear:
      // - 2 vales BOTA (1 quedará PENDIENTE, 1 pasará a SEPARADO)
      // - 1 vale ACCESORIOS (PENDIENTE)
      const v1 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: `${tag}-B1`,
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-12-01",
      });
      const v2 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: `${tag}-B2`,
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-12-01",
      });
      const v3 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKAACM.id,
        folio: `${tag}-A1`,
        departamentoValeId: ctx.catalogs.deptoCinCorte.id,
        fechaSolicitud: "2025-12-01",
      });
      ctx.trackVale(v1.json.data?.id);
      ctx.trackVale(v2.json.data?.id);
      ctx.trackVale(v3.json.data?.id);

      // Separar v2
      await ctx.apiRequest(
        "POST",
        `/vales/${v2.json.data.id}/separar`,
        ctx.users.almBotaMasCinCorte.token,
        {},
      );

      // Consultar filtrando por busqueda=CNT88, area=BOTA y estado=PENDIENTE
      const res = await ctx.apiRequest(
        "GET",
        `/vales?busqueda=${tag}&area=BOTA&estado=PENDIENTE`,
        ctx.users.registrador.token,
      );
      expect(res.status).toBe(200);
      // Items mostrados (busqueda=CNT88 + area=BOTA + estado=PENDIENTE) -> 1 (v1)
      expect(res.json.data.total).toBe(1);
      expect(res.json.data.items.length).toBe(1);

      // conteosPorEstado (busqueda=CNT88 + area=BOTA, ignorando estado=PENDIENTE) -> PENDIENTE: 1, SEPARADO: 1
      expect(res.json.data.conteosPorEstado.PENDIENTE).toBe(1);
      expect(res.json.data.conteosPorEstado.SEPARADO).toBe(1);
      expect(res.json.data.conteosPorEstado.ENTREGADO).toBe(0);

      // conteosPorArea (busqueda=CNT88 + estado=PENDIENTE, ignorando area=BOTA) -> BOTA: 1, ACCESORIOS: 1
      expect(res.json.data.conteosPorArea.BOTA).toBe(1);
      expect(res.json.data.conteosPorArea.ACCESORIOS).toBe(1);
      expect(res.json.data.conteosPorArea.OTRO).toBe(0);
    });

    test("T17: Mínimo privilegio de ADMIN (no recibe automáticamente vale:separar -> 403)", async () => {
      const ctx = getCtx();
      const v = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "ADM-MIN-1",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(v.json.data?.id);

      const resSep = await ctx.apiRequest(
        "POST",
        `/vales/${v.json.data.id}/separar`,
        ctx.users.adminMinPriv.token,
        {},
      );
      expect(resSep.status).toBe(403);
    });

    test("T18: Clave foránea compuesta bloquea en MySQL cruzar Serie o DepartamentoVale de otro departamento organizacional", async () => {
      const ctx = getCtx();
      let crossTenantBlocked = false;
      try {
        await prisma.valeMaterial.create({
          data: {
            departamentoId: ctx.deptoTestOtro.id,
            serieId: ctx.catalogs.serieKABTM.id, // Pertenece a deptoTestMP
            departamentoValeId: ctx.catalogs.deptoBotCorte.id, // Pertenece a deptoTestMP
            folio: "CROSS-01",
            area: "BOTA",
            fechaSolicitud: new Date(),
            creadoPorId: ctx.users.superAdmin.id,
          },
        });
      } catch {
        crossTenantBlocked = true;
      }
      expect(crossTenantBlocked).toBe(true);
    });
  });
}
