import { describe, expect, test } from "bun:test";
import { sessionService } from "../../../../src/modules/auth/services/session.service";
import { usersService } from "../../../../src/modules/users/users.service";
import type { ValesTestContext } from "../helpers/test-harness";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerSseRealtimeSuite(getCtx: () => ValesTestContext): void {
  describe("05. Seguridad, Filtrado por Alcance y Revocación Inmediata en Stream SSE (T19 + H2 + H3)", () => {
    test("T19 + H2: Filtrado HTTP SSE real por departamento organizacional, áreas, departamentos individuales, excepción B7 y lotes", async () => {
      const ctx = getCtx();

      const [
        sseSuperAdmin,
        sseRegistrador,
        sseAlmVacio,
        sseAlmMixto,
        sseOtroDepto,
      ] = await Promise.all([
        ctx.openSseStream(ctx.users.superAdmin.token),
        ctx.openSseStream(ctx.users.registrador.token),
        ctx.openSseStream(ctx.users.almVacio.token),
        ctx.openSseStream(ctx.users.almBotaMasCinCorte.token),
        ctx.openSseStream(ctx.users.usuarioOtroDepto.token),
      ]);

      try {
        // 1. Crear vale en CIN ADORNO (Área ACCESORIOS -> NO autorizado para almBotaMasCinCorte)
        const resCinAdorno = await ctx.apiRequest(
          "POST",
          "/vales",
          ctx.users.registrador.token,
          {
            serieId: ctx.catalogs.serieKAACM.id,
            folio: "SSE-NOAUT",
            departamentoValeId: ctx.catalogs.deptoCinAdorno.id,
            fechaSolicitud: "2025-10-10",
          },
        );
        ctx.trackVale(resCinAdorno.json.data?.id);
        const idCinAdorno = resCinAdorno.json.data.id;

        // Esperar recepción en SUPER_ADMIN y REGISTRADOR
        await Promise.all([
          sseSuperAdmin.waitForEvent(
            (e) => e.event === "VALE_CREADO" && e.data?.valeId === idCinAdorno,
          ),
          sseRegistrador.waitForEvent(
            (e) => e.event === "VALE_CREADO" && e.data?.valeId === idCinAdorno,
          ),
        ]);

        // 2. Crear vale B7 CORTE con área BOTA (SÍ autorizado para almBotaMasCinCorte)
        const resB7Bota = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
          serieId: ctx.catalogs.serieKABTM.id,
          folio: "SSE-B7BOTA",
          departamentoValeId: ctx.catalogs.deptoB7Corte.id,
          area: "BOTA",
          fechaSolicitud: "2025-10-10",
        });
        ctx.trackVale(resB7Bota.json.data?.id);
        const idB7Bota = resB7Bota.json.data.id;

        // 3. Crear vale B7 CORTE con área ACCESORIOS (NO autorizado para almBotaMasCinCorte)
        const resB7Acc = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
          serieId: ctx.catalogs.serieKAACM.id,
          folio: "SSE-B7ACC",
          departamentoValeId: ctx.catalogs.deptoB7Corte.id,
          area: "ACCESORIOS",
          fechaSolicitud: "2025-10-10",
        });
        ctx.trackVale(resB7Acc.json.data?.id);
        const idB7Acc = resB7Acc.json.data.id;

        // 4. Crear vale en CIN CORTE (SÍ autorizado para almBotaMasCinCorte por depto individual)
        const resCinCorte = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
          serieId: ctx.catalogs.serieKAACM.id,
          folio: "SSE-CINCOR",
          departamentoValeId: ctx.catalogs.deptoCinCorte.id,
          fechaSolicitud: "2025-10-10",
        });
        ctx.trackVale(resCinCorte.json.data?.id);
        const idCinCorte = resCinCorte.json.data.id;

        await Promise.all([
          sseAlmMixto.waitForEvent(
            (e) => e.event === "VALE_CREADO" && e.data?.valeId === idB7Bota,
          ),
          sseAlmMixto.waitForEvent(
            (e) => e.event === "VALE_CREADO" && e.data?.valeId === idCinCorte,
          ),
          sseSuperAdmin.waitForEvent(
            (e) => e.event === "VALE_CREADO" && e.data?.valeId === idCinCorte,
          ),
        ]);

        // 5. Ejecutar lote desde SUPER_ADMIN mezclando [idB7Bota (autorizado), idCinAdorno (no autorizado)]
        const resLote = await ctx.apiRequest(
          "POST",
          "/vales/batch-operar",
          ctx.users.superAdmin.token,
          {
            valeIds: [idB7Bota, idCinAdorno],
            accion: "SEPARAR",
          },
        );
        expect(resLote.status).toBe(200);

        const evLoteAlmMixto = await sseAlmMixto.waitForEvent(
          (e) => e.event === "VALES_LOTE_OPERADO",
        );

        // El almacenista mixto solo debe recibir en valeIds el vale autorizado (idB7Bota), nunca idCinAdorno
        expect(evLoteAlmMixto.data.valeIds).toEqual([idB7Bota]);
        expect(evLoteAlmMixto.data.areas).toEqual(["BOTA"]);

        await sleep(120);

        // Comprobar que sseAlmMixto NUNCA recibió idCinAdorno ni idB7Acc
        const idsRecibidosAlmMixto = sseAlmMixto.events
          .filter((e) => e.event === "VALE_CREADO")
          .map((e) => (e.data as any).valeId);
        expect(idsRecibidosAlmMixto).toContain(idB7Bota);
        expect(idsRecibidosAlmMixto).toContain(idCinCorte);
        expect(idsRecibidosAlmMixto).not.toContain(idCinAdorno);
        expect(idsRecibidosAlmMixto).not.toContain(idB7Acc);

        // Comprobar que sseAlmVacio (Deny-by-default) no recibió NINGÚN evento de negocio
        const eventosNegocioAlmVacio = sseAlmVacio.events.filter(
          (e) => e.event !== "conectado",
        );
        expect(eventosNegocioAlmVacio.length).toBe(0);

        // Comprobar que sseOtroDepto no recibió ningún evento de deptoTestMP
        const eventosNegocioOtroDepto = sseOtroDepto.events.filter(
          (e) => e.event !== "conectado",
        );
        expect(eventosNegocioOtroDepto.length).toBe(0);
      } finally {
        sseSuperAdmin.close();
        sseRegistrador.close();
        sseAlmVacio.close();
        sseAlmMixto.close();
        sseOtroDepto.close();
      }
    });

    test("H3: Revocación inmediata en SSE al cambiar versionPermisos o perder alcance (sin esperar al intervalo de 25s)", async () => {
      const ctx = getCtx();

      // Crear almacenista temporal con área BOTA autorizada
      const tempUser = await usersService.createUser(
        {
          usuario: `almt_${ctx.runId.toLowerCase()}`.slice(0, 30),
          nombre: "Almacenista Revocacion SSE",
          password: "Password123",
          rolId: ctx.rolMap["ALMACENISTA"]!,
          departamentoId: ctx.deptoTestMP.id,
          tipoSurtidoAlmacen: "TODOS",
          areasVale: ["BOTA"],
        },
        ctx.users.superAdmin.id,
      );
      ctx.tracked.userIds.add(tempUser.id);

      const loginTemp = await sessionService.login({
        usuario: tempUser.usuario,
        password: "Password123",
      });

      const sseTemp = await ctx.openSseStream(loginTemp.accessToken);

      try {
        // 1. Mientras tiene BOTA autorizada, recibe evento de BOTA
        const vAntes = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
          serieId: ctx.catalogs.serieKABTM.id,
          folio: "REV-ANTES",
          departamentoValeId: ctx.catalogs.deptoBotCorte.id,
          fechaSolicitud: "2025-10-10",
        });
        ctx.trackVale(vAntes.json.data?.id);

        await sseTemp.waitForEvent(
          (e) => e.event === "VALE_CREADO" && e.data?.valeId === vAntes.json.data.id,
        );

        // 2. Revocarle el área BOTA (dejar areasVale=[]) -> esto incrementa versionPermisos en BD
        await usersService.updateUser(
          tempUser.id,
          { areasVale: [] },
          ctx.users.superAdmin.id,
        );

        // 3. Inmediatamente (en < 50ms, sin esperar 25s) se registra un nuevo vale en BOTA
        const vDespues = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
          serieId: ctx.catalogs.serieKABTM.id,
          folio: "REV-DESPUES",
          departamentoValeId: ctx.catalogs.deptoBotCorte.id,
          fechaSolicitud: "2025-10-10",
        });
        ctx.trackVale(vDespues.json.data?.id);

        // El stream debe emitir 'permisos_obsoletos' inmediatamente antes de distribuir el evento y NO entregar REV-DESPUES
        await sseTemp.waitForEvent((e) => e.event === "permisos_obsoletos", 3000);

        await sleep(80);

        const recibioDespues = sseTemp.events.some(
          (e) => e.event === "VALE_CREADO" && (e.data as any)?.valeId === vDespues.json.data.id,
        );
        expect(recibioDespues).toBe(false);
        expect(sseTemp.closedByServer).toBe(true);
      } finally {
        sseTemp.close();
      }
    });
  });
}
