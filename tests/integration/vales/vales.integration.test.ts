import { afterAll, beforeAll, describe } from "bun:test";
import {
  setupValesTestContext,
  teardownValesTestContext,
  type ValesTestContext,
} from "./helpers/test-harness";
import { registerCatalogosYRegistroSuite } from "./suites/01-catalogos-y-registro.suite";
import { registerFechasHorasYEdicionSuite } from "./suites/02-fechas-horas-y-edicion.suite";
import { registerAlcanceSeguridadYContadoresSuite } from "./suites/03-alcance-seguridad-y-contadores.suite";
import { registerCicloVidaYLotesSuite } from "./suites/04-ciclo-vida-y-lotes.suite";
import { registerSseRealtimeSuite } from "./suites/05-sse-realtime.suite";

describe("Módulo de Vales de Materia Prima — Suite Permanente de Integración (Fase 3)", () => {
  let ctx: ValesTestContext;

  beforeAll(async () => {
    ctx = await setupValesTestContext();
  });

  afterAll(async () => {
    if (ctx) {
      await teardownValesTestContext(ctx);
    }
  });

  const getCtx = () => ctx;

  registerCatalogosYRegistroSuite(getCtx);
  registerFechasHorasYEdicionSuite(getCtx);
  registerAlcanceSeguridadYContadoresSuite(getCtx);
  registerCicloVidaYLotesSuite(getCtx);
  registerSseRealtimeSuite(getCtx);
});
