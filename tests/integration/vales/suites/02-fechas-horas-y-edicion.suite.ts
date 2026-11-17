import { describe, expect, test } from "bun:test";
import type { ValesTestContext } from "../helpers/test-harness";

export function registerFechasHorasYEdicionSuite(getCtx: () => ValesTestContext): void {
  describe("02. Fechas, Horas Vespertinas (19:30, 23:45) y Edición Parcial (T07 + H4 + H5)", () => {
    test("T07: Edición en PENDIENTE actualiza serie, folio, área fija y guarda diff JSON en Historial", async () => {
      const ctx = getCtx();
      const creado = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "EDIT-01",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-15",
      });
      ctx.trackVale(creado.json.data?.id);
      expect(creado.status).toBe(201);

      const editado = await ctx.apiRequest(
        "PUT",
        `/vales/${creado.json.data.id}`,
        ctx.users.registrador.token,
        {
          serieId: ctx.catalogs.serieKAACM.id,
          folio: " 4891 ",
          departamentoValeId: ctx.catalogs.deptoCinCorte.id,
        },
      );

      expect(editado.status).toBe(200);
      expect(editado.json.data.serie.codigo).toBe("KAACM");
      expect(editado.json.data.folio).toBe("4891");
      expect(editado.json.data.area).toBe("ACCESORIOS");

      const entradaEdicion = editado.json.data.historialEstados.find(
        (h: any) => h.accion === "EDICION",
      );
      expect(entradaEdicion).toBeDefined();
      expect(entradaEdicion.cambios.folio).toEqual({
        anterior: "EDIT-01",
        nuevo: "4891",
      });
      expect(entradaEdicion.cambios.area).toEqual({
        anterior: "BOTA",
        nuevo: "ACCESORIOS",
      });
    });

    test("H4: Horas vespertinas 19:30 y 23:45 permanecen en el día documental capturado y coinciden con fechaDesde/fechaHasta", async () => {
      const ctx = getCtx();

      const res1930 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "HORA-1930",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-11-20",
        horaSolicitud: "19:30",
      });
      ctx.trackVale(res1930.json.data?.id);

      const res2345 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "HORA-2345",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-11-20",
        horaSolicitud: "23:45",
      });
      ctx.trackVale(res2345.json.data?.id);

      const resSinHora = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "HORA-SIN",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-11-20",
      });
      ctx.trackVale(resSinHora.json.data?.id);

      expect(res1930.status).toBe(201);
      expect(res1930.json.data.fechaSolicitud).toBe("2025-11-20T19:30:00.000Z");
      expect(res1930.json.data.fechaSolicitud.slice(0, 10)).toBe("2025-11-20");
      expect(res1930.json.data.tieneHoraSolicitud).toBe(true);

      expect(res2345.status).toBe(201);
      expect(res2345.json.data.fechaSolicitud).toBe("2025-11-20T23:45:00.000Z");
      expect(res2345.json.data.fechaSolicitud.slice(0, 10)).toBe("2025-11-20");
      expect(res2345.json.data.tieneHoraSolicitud).toBe(true);

      // Filtrar exactamente el día 2025-11-20: debe devolver los 3 vales (incluyendo 19:30 y 23:45)
      const resFiltroDia20 = await ctx.apiRequest(
        "GET",
        "/vales?fechaDesde=2025-11-20&fechaHasta=2025-11-20",
        ctx.users.registrador.token,
      );
      expect(resFiltroDia20.status).toBe(200);
      const foliosDia20 = resFiltroDia20.json.data.items.map((v: any) => v.folio);
      expect(foliosDia20).toContain("HORA-1930");
      expect(foliosDia20).toContain("HORA-2345");
      expect(foliosDia20).toContain("HORA-SIN");

      // Filtrar el día siguiente 2025-11-21: NO debe aparecer ninguno de los vales de 19:30 ni 23:45 del día 20
      const resFiltroDia21 = await ctx.apiRequest(
        "GET",
        "/vales?fechaDesde=2025-11-21&fechaHasta=2025-11-21",
        ctx.users.registrador.token,
      );
      expect(resFiltroDia21.status).toBe(200);
      const foliosDia21 = resFiltroDia21.json.data.items.map((v: any) => v.folio);
      expect(foliosDia21).not.toContain("HORA-1930");
      expect(foliosDia21).not.toContain("HORA-2345");
    });

    test("H5: Editar solamente la fecha conserva la hora existente; quitar la hora requiere acción explícita", async () => {
      const ctx = getCtx();

      const creado = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "KEEP-HOUR",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-11-20",
        horaSolicitud: "19:30",
      });
      ctx.trackVale(creado.json.data?.id);
      const valeId = creado.json.data.id;

      // 1. Cambiar solamente la fecha a 2025-11-25 sin enviar horaSolicitud -> debe conservar 19:30 y tieneHoraSolicitud=true
      const resSoloFecha = await ctx.apiRequest(
        "PUT",
        `/vales/${valeId}`,
        ctx.users.registrador.token,
        {
          fechaSolicitud: "2025-11-25",
        },
      );
      expect(resSoloFecha.status).toBe(200);
      expect(resSoloFecha.json.data.tieneHoraSolicitud).toBe(true);
      expect(resSoloFecha.json.data.fechaSolicitud).toBe("2025-11-25T19:30:00.000Z");

      // 2. Cambiar la hora explícitamente a 23:45
      const resCambioHora = await ctx.apiRequest(
        "PUT",
        `/vales/${valeId}`,
        ctx.users.registrador.token,
        {
          horaSolicitud: "23:45",
        },
      );
      expect(resCambioHora.status).toBe(200);
      expect(resCambioHora.json.data.tieneHoraSolicitud).toBe(true);
      expect(resCambioHora.json.data.fechaSolicitud).toBe("2025-11-25T23:45:00.000Z");

      // 3. Quitar la hora explícitamente enviando horaSolicitud: null
      const resQuitarHora = await ctx.apiRequest(
        "PUT",
        `/vales/${valeId}`,
        ctx.users.registrador.token,
        {
          horaSolicitud: null,
        },
      );
      expect(resQuitarHora.status).toBe(200);
      expect(resQuitarHora.json.data.tieneHoraSolicitud).toBe(false);
      expect(resQuitarHora.json.data.fechaSolicitud).toBe("2025-11-25T12:00:00.000Z");
    });
  });
}
