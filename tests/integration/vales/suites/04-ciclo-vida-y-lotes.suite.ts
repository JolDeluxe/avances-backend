import { describe, expect, test } from "bun:test";
import { prisma } from "../../../../src/config/database";
import type { ValesTestContext } from "../helpers/test-harness";

export function registerCicloVidaYLotesSuite(getCtx: () => ValesTestContext): void {
  describe("04. Ciclo de Vida, Matriz de Retrocesos, Cancelación, Integridad y Lotes (T10-T16 + H7 + Secc. 2)", () => {
    test("T10 + T11 + T12: Separar, Entregar, Separar y Entregar atómico, y Descontar por Auditor", async () => {
      const ctx = getCtx();

      // Vale 1: flujo en 2 pasos (PENDIENTE -> SEPARADO -> ENTREGADO -> DESCONTADO)
      const v1 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "LC-01",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(v1.json.data?.id);
      const id1 = v1.json.data.id;

      const resSep = await ctx.apiRequest(
        "POST",
        `/vales/${id1}/separar`,
        ctx.users.almBotaMasCinCorte.token,
        {},
      );
      expect(resSep.status).toBe(200);
      expect(resSep.json.data.estado).toBe("SEPARADO");

      const resEnt = await ctx.apiRequest(
        "POST",
        `/vales/${id1}/entregar`,
        ctx.users.almBotaMasCinCorte.token,
        {},
      );
      expect(resEnt.status).toBe(200);
      expect(resEnt.json.data.estado).toBe("ENTREGADO");
      expect(resEnt.json.data.entregadoPor.id).toBe(ctx.users.almBotaMasCinCorte.id);

      const resDesc = await ctx.apiRequest(
        "POST",
        `/vales/${id1}/descontar`,
        ctx.users.auditor.token,
        {},
      );
      expect(resDesc.status).toBe(200);
      expect(resDesc.json.data.estado).toBe("DESCONTADO");
      expect(resDesc.json.data.descontadoPor.id).toBe(ctx.users.auditor.id);

      // Vale 2: flujo atómico Separar y Entregar (PENDIENTE -> ENTREGADO en una sola transacción)
      const v2 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "LC-02",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(v2.json.data?.id);
      const id2 = v2.json.data.id;

      const resSepYEnt = await ctx.apiRequest(
        "POST",
        `/vales/${id2}/separar`,
        ctx.users.almBotaMasCinCorte.token,
        { entregarTambien: true },
      );
      expect(resSepYEnt.status).toBe(200);
      expect(resSepYEnt.json.data.estado).toBe("ENTREGADO");
      expect(resSepYEnt.json.data.separadoPor.id).toBe(ctx.users.almBotaMasCinCorte.id);
      expect(resSepYEnt.json.data.entregadoPor.id).toBe(ctx.users.almBotaMasCinCorte.id);
      expect(resSepYEnt.json.data.fechaSeparado).toBeTruthy();
      expect(resSepYEnt.json.data.fechaEntregado).toBeTruthy();
    });

    test("T13: Matriz de retrocesos de 1 paso estricto, limpieza de campos y separación vale:retroceder_descuento vs vale:retroceder", async () => {
      const ctx = getCtx();

      const v = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "RET-01",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(v.json.data?.id);
      const id = v.json.data.id;

      // Llevar a ENTREGADO
      await ctx.apiRequest("POST", `/vales/${id}/separar`, ctx.users.almBotaMasCinCorte.token, {
        entregarTambien: true,
      });

      // 1. AUDITOR (solo tiene vale:retroceder_descuento) intenta retroceder ENTREGADO -> SEPARADO => 403
      const resAudRetroEntregado = await ctx.apiRequest(
        "POST",
        `/vales/${id}/retroceder`,
        ctx.users.auditor.token,
        { motivo: "Intento de retroceder entrega con permiso de auditor" },
      );
      expect(resAudRetroEntregado.status).toBe(403);

      // Llevar a DESCONTADO
      await ctx.apiRequest("POST", `/vales/${id}/descontar`, ctx.users.auditor.token, {});

      // 2. AUDITOR retrocede DESCONTADO -> ENTREGADO => 200 y limpia descontadoPor/fechaDescontado
      const resAudRetroDesc = await ctx.apiRequest(
        "POST",
        `/vales/${id}/retroceder`,
        ctx.users.auditor.token,
        { motivo: "Se marcó descontado por error de captura" },
      );
      expect(resAudRetroDesc.status).toBe(200);
      expect(resAudRetroDesc.json.data.estado).toBe("ENTREGADO");
      expect(resAudRetroDesc.json.data.descontadoPor).toBeNull();
      expect(resAudRetroDesc.json.data.fechaDescontado).toBeNull();
      expect(resAudRetroDesc.json.data.entregadoPor).not.toBeNull();

      // 3. SUPER_ADMIN intenta saltar 2 pasos (ENTREGADO -> PENDIENTE) => 400
      const resSalto2Pasos = await ctx.apiRequest(
        "POST",
        `/vales/${id}/retroceder`,
        ctx.users.superAdmin.token,
        { estadoDestino: "PENDIENTE", motivo: "Intento de saltar 2 pasos" },
      );
      expect(resSalto2Pasos.status).toBe(400);

      // 4. SUPER_ADMIN retrocede 1 paso (ENTREGADO -> SEPARADO) => 200 y limpia entregadoPor conservando separadoPor
      const resRetroSep = await ctx.apiRequest(
        "POST",
        `/vales/${id}/retroceder`,
        ctx.users.superAdmin.token,
        { motivo: "Regresar a separado para revisión" },
      );
      expect(resRetroSep.status).toBe(200);
      expect(resRetroSep.json.data.estado).toBe("SEPARADO");
      expect(resRetroSep.json.data.entregadoPor).toBeNull();
      expect(resRetroSep.json.data.separadoPor).not.toBeNull();

      // 5. SUPER_ADMIN retrocede 1 paso (SEPARADO -> PENDIENTE) => 200 y limpia separadoPor
      const resRetroPend = await ctx.apiRequest(
        "POST",
        `/vales/${id}/retroceder`,
        ctx.users.superAdmin.token,
        { motivo: "Regresar a pendiente" },
      );
      expect(resRetroPend.status).toBe(200);
      expect(resRetroPend.json.data.estado).toBe("PENDIENTE");
      expect(resRetroPend.json.data.separadoPor).toBeNull();
    });

    test("T14 + H7-A: Reglas de cancelación lógica (permitido en PENDIENTE para REGISTRADOR, bloqueado en SEPARADO para REGISTRADOR, permitido en SEPARADO con capacidad de almacén/retroceso, bloqueado en ENTREGADO)", async () => {
      const ctx = getCtx();

      // 1. REGISTRADOR cancela vale en PENDIENTE -> 200 OK
      const vPend = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "CANC-PEND",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(vPend.json.data?.id);

      const resCancPend = await ctx.apiRequest(
        "POST",
        `/vales/${vPend.json.data.id}/cancelar`,
        ctx.users.registrador.token,
        { motivo: "Error de captura detectado por registrador" },
      );
      expect(resCancPend.status).toBe(200);
      expect(resCancPend.json.data.estado).toBe("CANCELADO");

      // 2. Vale en SEPARADO: REGISTRADOR NO puede cancelarlo (403 Forbidden), pero un usuario con vale:cancelar + capacidad de almacén/retroceso SÍ puede
      const vSep = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "CANC-SEP",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(vSep.json.data?.id);
      await ctx.apiRequest(
        "POST",
        `/vales/${vSep.json.data.id}/separar`,
        ctx.users.almBotaMasCinCorte.token,
        {},
      );

      const resRegCancSep = await ctx.apiRequest(
        "POST",
        `/vales/${vSep.json.data.id}/cancelar`,
        ctx.users.registrador.token,
        { motivo: "Registrador intentando cancelar vale ya separado" },
      );
      expect(resRegCancSep.status).toBe(403);

      // En cambio almConExcepciones (tiene vale:cancelar + vale:separar y alcance BOTA) o superAdmin sí puede cancelarlo en SEPARADO
      const resAlmCancSep = await ctx.apiRequest(
        "POST",
        `/vales/${vSep.json.data.id}/cancelar`,
        ctx.users.almConExcepciones.token,
        { motivo: "Cancelado en almacén antes de entregar" },
      );
      expect(resAlmCancSep.status).toBe(200);
      expect(resAlmCancSep.json.data.estado).toBe("CANCELADO");

      // 3. Vale en ENTREGADO: nadie puede cancelarlo directamente (400 Bad Request)
      const vEnt = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "CANC-ENT",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(vEnt.json.data?.id);
      await ctx.apiRequest(
        "POST",
        `/vales/${vEnt.json.data.id}/separar`,
        ctx.users.almBotaMasCinCorte.token,
        { entregarTambien: true },
      );

      const resCancEnt = await ctx.apiRequest(
        "POST",
        `/vales/${vEnt.json.data.id}/cancelar`,
        ctx.users.superAdmin.token,
        { motivo: "Intento de cancelar vale ya entregado" },
      );
      expect(resCancEnt.status).toBe(400);
    });

    test("H7-B: Las excepciones de permisos (vale:cancelar, vale:retroceder, vale:descontar) NO permiten operar fuera del alcance operativo", async () => {
      const ctx = getCtx();

      // Crear un vale en CIN ADORNO (Área ACCESORIOS). almConExcepciones solo tiene autorizada el área BOTA.
      const vFueraAlcance = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKAACM.id,
        folio: "EXC-OUT-1",
        departamentoValeId: ctx.catalogs.deptoCinAdorno.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(vFueraAlcance.json.data?.id);
      const id = vFueraAlcance.json.data.id;

      // 1. Intenta cancelar en PENDIENTE con excepción vale:cancelar -> bloqueado por alcance (403)
      const resCanc = await ctx.apiRequest(
        "POST",
        `/vales/${id}/cancelar`,
        ctx.users.almConExcepciones.token,
        { motivo: "Intento fuera de alcance" },
      );
      expect(resCanc.status).toBe(403);

      // SUPER_ADMIN lo pasa a SEPARADO y luego a ENTREGADO
      await ctx.apiRequest("POST", `/vales/${id}/separar`, ctx.users.superAdmin.token, {
        entregarTambien: true,
      });

      // 2. Intenta retroceder con excepción vale:retroceder -> bloqueado por alcance (403)
      const resRetro = await ctx.apiRequest(
        "POST",
        `/vales/${id}/retroceder`,
        ctx.users.almConExcepciones.token,
        { motivo: "Intento de retroceso fuera de alcance" },
      );
      expect(resRetro.status).toBe(403);

      // 3. Intenta descontar con excepción vale:descontar -> bloqueado por alcance (403)
      const resDesc = await ctx.apiRequest(
        "POST",
        `/vales/${id}/descontar`,
        ctx.users.almConExcepciones.token,
        {},
      );
      expect(resDesc.status).toBe(403);
    });

    test("T15: Integridad referencial onDelete: Restrict impide eliminar físicamente un Vale que tiene Historial", async () => {
      const ctx = getCtx();
      const v = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "RESTR-01",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(v.json.data?.id);

      let restrictBlocked = false;
      try {
        await prisma.valeMaterial.delete({
          where: { id: v.json.data.id },
        });
      } catch {
        restrictBlocked = true;
      }
      expect(restrictBlocked).toBe(true);
    });

    test("T16 + Secc. 2: batch-operar valida permisos por acción, alcance individual de cada vale y política All-or-Nothing", async () => {
      const ctx = getCtx();

      const vBota1 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "BATCH-B1",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      const vBota2 = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKABTM.id,
        folio: "BATCH-B2",
        departamentoValeId: ctx.catalogs.deptoBotCorte.id,
        fechaSolicitud: "2025-10-10",
      });
      const vNoAut = await ctx.apiRequest("POST", "/vales", ctx.users.registrador.token, {
        serieId: ctx.catalogs.serieKAACM.id,
        folio: "BATCH-NOAUT",
        departamentoValeId: ctx.catalogs.deptoCinAdorno.id,
        fechaSolicitud: "2025-10-10",
      });
      ctx.trackVale(vBota1.json.data?.id);
      ctx.trackVale(vBota2.json.data?.id);
      ctx.trackVale(vNoAut.json.data?.id);

      const id1 = vBota1.json.data.id;
      const id2 = vBota2.json.data.id;
      const idNoAut = vNoAut.json.data.id;

      // 1. AUDITOR (tiene vale:descontar) intenta batch-operar con accion SEPARAR -> 403
      const resAuditorSeparar = await ctx.apiRequest(
        "POST",
        "/vales/batch-operar",
        ctx.users.auditor.token,
        {
          valeIds: [id1],
          accion: "SEPARAR",
        },
      );
      expect(resAuditorSeparar.status).toBe(403);

      // 2. ALMACENISTA (tiene vale:separar y vale:entregar) intenta batch-operar con accion DESCONTAR -> 403
      const resAlmDescontar = await ctx.apiRequest(
        "POST",
        "/vales/batch-operar",
        ctx.users.almBotaMasCinCorte.token,
        {
          valeIds: [id1],
          accion: "DESCONTAR",
        },
      );
      expect(resAlmDescontar.status).toBe(403);

      // 3. Usuario con solo vale:separar (sin vale:entregar) intenta SEPARAR_Y_ENTREGAR (individual y masivo) -> 403
      const resSoloSepInd = await ctx.apiRequest(
        "POST",
        `/vales/${id1}/separar`,
        ctx.users.almSoloSeparar.token,
        { entregarTambien: true },
      );
      const resSoloSepBatch = await ctx.apiRequest(
        "POST",
        "/vales/batch-operar",
        ctx.users.almSoloSeparar.token,
        {
          valeIds: [id1],
          accion: "SEPARAR_Y_ENTREGAR",
        },
      );
      expect(resSoloSepInd.status).toBe(403);
      expect(resSoloSepBatch.status).toBe(403);

      // 4. Lote mixto [id1 (autorizado), idNoAut (NO autorizado)] -> 403 y rollback total (id1 permanece en PENDIENTE)
      const resBatchMixto = await ctx.apiRequest(
        "POST",
        "/vales/batch-operar",
        ctx.users.almBotaMasCinCorte.token,
        {
          valeIds: [id1, idNoAut],
          accion: "SEPARAR",
        },
      );
      expect(resBatchMixto.status).toBe(403);

      const checkId1 = await prisma.valeMaterial.findUniqueOrThrow({ where: { id: id1 } });
      expect(checkId1.estado).toBe("PENDIENTE");

      // 5. Lote válido [id1, id2] con SEPARAR_Y_ENTREGAR -> 200 OK y ambos pasan a ENTREGADO
      const resBatchOk = await ctx.apiRequest(
        "POST",
        "/vales/batch-operar",
        ctx.users.almBotaMasCinCorte.token,
        {
          valeIds: [id1, id2],
          accion: "SEPARAR_Y_ENTREGAR",
        },
      );
      expect(resBatchOk.status).toBe(200);
      expect(resBatchOk.json.data.procesados).toBe(2);
      expect(resBatchOk.json.data.estadoNuevo).toBe("ENTREGADO");
    });
  });
}
