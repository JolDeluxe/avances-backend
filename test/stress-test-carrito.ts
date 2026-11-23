import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { prisma } from "../src/config/database";
import { securityService } from "../src/modules/auth/services/security.service";

describe("Prueba de Carga Masiva - Modo Varios a la Vez (Listados y Vales)", () => {
  const app = createApp();
  let server: Server;
  let port: number;
  let authToken: string;
  let lineaId: number;
  let serieId: number;
  let deptoValeId: number;

  const testListadosCreados: number[] = [];
  const testValesCreados: number[] = [];

  const requestApi = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      return { status: res.status, data: { raw: text } };
    }
  };

  beforeAll(async () => {
    server = app.listen(0);
    const addr = server.address();
    if (typeof addr === "object" && addr) {
      port = addr.port;
    } else {
      throw new Error("No se pudo iniciar el servidor");
    }

    // Login con admin
    const defaultPassword = "123456789";
    const defaultPasswordHash = securityService.hashPassword(defaultPassword);
    const defaultPasswordEncrypted = securityService.encryptPassword(defaultPassword);

    await prisma.usuario.updateMany({
      where: { usuario: "admin" },
      data: {
        passwordHash: defaultPasswordHash,
        passwordEncrypted: defaultPasswordEncrypted,
        estado: "ACTIVO",
      },
    });

    const loginRes = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: "admin", password: defaultPassword }),
    });
    const loginJson = (await loginRes.json()) as any;
    if (!loginJson?.data?.accessToken) {
      console.error("Login failed:", loginRes.status, loginJson);
      throw new Error(`Login failed with status ${loginRes.status}: ${JSON.stringify(loginJson)}`);
    }
    authToken = loginJson.data.accessToken;

    // Obtener catálogos necesarios
    const linea = await prisma.lineaProduccion.findFirst({
      where: { estado: "ACTIVO" },
    });
    if (!linea) throw new Error("No hay línea activa para pruebas");
    lineaId = linea.id;

    const serie = await prisma.serieVale.findFirst({
      where: { estado: "ACTIVO" },
    });
    if (!serie) throw new Error("No hay serie activa para pruebas");
    serieId = serie.id;

    const deptoVale = await prisma.departamentoVale.findFirst({
      where: { estado: "ACTIVO" },
    });
    if (!deptoVale) throw new Error("No hay depto vale activo para pruebas");
    deptoValeId = deptoVale.id;
  });

  afterAll(async () => {
    // Limpieza a prueba de fallos: buscar por IDs registrados o por prefijos de prueba
    try {
      const listados = await prisma.listadoMaterial.findMany({
        where: {
          OR: [
            { id: { in: testListadosCreados } },
            { numeroListado: { startsWith: "TST-L" } },
          ],
        },
        select: { id: true },
      });
      const listadoIds = listados.map((l) => l.id);
      if (listadoIds.length > 0) {
        await prisma.historialEstadoListado.deleteMany({
          where: { listadoMaterialId: { in: listadoIds } },
        });
        await prisma.listadoSurtidoFrente.deleteMany({
          where: { listadoMaterialId: { in: listadoIds } },
        });
        await prisma.registroAuditoria.deleteMany({
          where: { entidad: "listados_material", entidadId: { in: listadoIds } },
        });
        await prisma.listadoMaterial.deleteMany({
          where: { id: { in: listadoIds } },
        });
      }

      const vales = await prisma.valeMaterial.findMany({
        where: {
          OR: [
            { id: { in: testValesCreados } },
            { folio: { startsWith: "FOL-" } },
          ],
        },
        select: { id: true },
      });
      const valeIds = vales.map((v) => v.id);
      if (valeIds.length > 0) {
        await prisma.historialEstadoVale.deleteMany({
          where: { valeId: { in: valeIds } },
        });
        await prisma.registroAuditoria.deleteMany({
          where: { entidad: "vales_material", entidadId: { in: valeIds } },
        });
        await prisma.valeMaterial.deleteMany({
          where: { id: { in: valeIds } },
        });
      }
    } catch (err) {
      console.error("Error en cleanup afterAll:", err);
    }

    server.close();
  });

  it("Carga masiva de Listados (50 en bucle secuencial como en frontend)", async () => {
    const timestamp = Date.now();
    const CANTIDAD = 50;
    const inicio = performance.now();
    let exitosos = 0;
    const fallos: any[] = [];

    for (let i = 1; i <= CANTIDAD; i++) {
      const numListado = `TST-L50-${timestamp}-${i}`;
      const res = await requestApi("POST", "/listados", {
        numeroListado: numListado,
        lineaProduccionId: lineaId,
        fechaRequerida: "2026-12-01",
      });

      if (res.status === 201 && res.data.success) {
        exitosos++;
        testListadosCreados.push(res.data.data.id);
      } else {
        fallos.push({ item: i, status: res.status, error: res.data });
      }
    }

    const duracion = ((performance.now() - inicio) / 1000).toFixed(2);
    console.log(`[TEST LISTADOS 50]: ${exitosos}/${CANTIDAD} exitosos en ${duracion}s (${((Number(duracion) / CANTIDAD) * 1000).toFixed(1)}ms/req)`);

    expect(fallos).toHaveLength(0);
    expect(exitosos).toBe(CANTIDAD);
  }, 30000);

  it("Carga masiva de Vales (50 en bucle secuencial como en frontend)", async () => {
    const timestamp = Date.now();
    const CANTIDAD = 50;
    const inicio = performance.now();
    let exitosos = 0;
    const fallos: any[] = [];

    for (let i = 1; i <= CANTIDAD; i++) {
      const folio = `FOL-50-${timestamp}-${i}`;
      const res = await requestApi("POST", "/vales", {
        serieId,
        folio,
        departamentoValeId: deptoValeId,
        fechaSolicitud: "2026-12-01",
      });

      if (res.status === 201 && (res.data?.data?.id || res.data?.id)) {
        exitosos++;
        testValesCreados.push(res.data?.data?.id ?? res.data?.id);
      } else {
        fallos.push({ item: i, status: res.status, error: res.data });
      }
    }

    const duracion = ((performance.now() - inicio) / 1000).toFixed(2);
    console.log(`[TEST VALES 50]: ${exitosos}/${CANTIDAD} exitosos en ${duracion}s (${((Number(duracion) / CANTIDAD) * 1000).toFixed(1)}ms/req)`);

    expect(fallos).toHaveLength(0);
    expect(exitosos).toBe(CANTIDAD);
  }, 30000);

  it("Carga masiva de Listados (100 en bucle secuencial)", async () => {
    const timestamp = Date.now();
    const CANTIDAD = 100;
    const inicio = performance.now();
    let exitosos = 0;
    const fallos: any[] = [];

    for (let i = 1; i <= CANTIDAD; i++) {
      const numListado = `TST-L100-${timestamp}-${i}`;
      const res = await requestApi("POST", "/listados", {
        numeroListado: numListado,
        lineaProduccionId: lineaId,
        fechaRequerida: "2026-12-01",
      });

      if (res.status === 201 && res.data.success) {
        exitosos++;
        testListadosCreados.push(res.data.data.id);
      } else {
        fallos.push({ item: i, status: res.status, error: res.data });
      }
    }

    const duracion = ((performance.now() - inicio) / 1000).toFixed(2);
    console.log(`[TEST LISTADOS 100]: ${exitosos}/${CANTIDAD} exitosos en ${duracion}s (${((Number(duracion) / CANTIDAD) * 1000).toFixed(1)}ms/req)`);

    expect(fallos).toHaveLength(0);
    expect(exitosos).toBe(CANTIDAD);
  }, 30000);

  it("Carga masiva de Vales (100 en bucle secuencial)", async () => {
    const timestamp = Date.now();
    const CANTIDAD = 100;
    const inicio = performance.now();
    let exitosos = 0;
    const fallos: any[] = [];

    for (let i = 1; i <= CANTIDAD; i++) {
      const folio = `FOL-100-${timestamp}-${i}`;
      const res = await requestApi("POST", "/vales", {
        serieId,
        folio,
        departamentoValeId: deptoValeId,
        fechaSolicitud: "2026-12-01",
      });

      if (res.status === 201 && (res.data?.data?.id || res.data?.id)) {
        exitosos++;
        testValesCreados.push(res.data?.data?.id ?? res.data?.id);
      } else {
        fallos.push({ item: i, status: res.status, error: res.data });
      }
    }

    const duracion = ((performance.now() - inicio) / 1000).toFixed(2);
    console.log(`[TEST VALES 100]: ${exitosos}/${CANTIDAD} exitosos en ${duracion}s (${((Number(duracion) / CANTIDAD) * 1000).toFixed(1)}ms/req)`);

    expect(fallos).toHaveLength(0);
    expect(exitosos).toBe(CANTIDAD);
  }, 30000);

  it("Carga masiva ultra pesada: 200 Listados y 200 Vales (400 registros totales)", async () => {
    const timestamp = Date.now();
    const CANTIDAD = 200;

    // 200 Listados
    const inicioL = performance.now();
    let exitososL = 0;
    const fallosL: any[] = [];
    for (let i = 1; i <= CANTIDAD; i++) {
      const numListado = `TST-L200-${timestamp}-${i}`;
      const res = await requestApi("POST", "/listados", {
        numeroListado: numListado,
        lineaProduccionId: lineaId,
        fechaRequerida: "2026-12-01",
      });
      if (res.status === 201 && res.data.success) {
        exitososL++;
        testListadosCreados.push(res.data.data.id);
      } else {
        fallosL.push({ item: i, status: res.status, error: res.data });
      }
    }
    const duracionL = ((performance.now() - inicioL) / 1000).toFixed(2);
    console.log(`[TEST LISTADOS 200]: ${exitososL}/${CANTIDAD} exitosos en ${duracionL}s (${((Number(duracionL) / CANTIDAD) * 1000).toFixed(1)}ms/req)`);
    expect(fallosL).toHaveLength(0);
    expect(exitososL).toBe(CANTIDAD);

    // 200 Vales
    const inicioV = performance.now();
    let exitososV = 0;
    const fallosV: any[] = [];
    for (let i = 1; i <= CANTIDAD; i++) {
      const folio = `FOL-200-${timestamp}-${i}`;
      const res = await requestApi("POST", "/vales", {
        serieId,
        folio,
        departamentoValeId: deptoValeId,
        fechaSolicitud: "2026-12-01",
      });
      if (res.status === 201 && (res.data?.data?.id || res.data?.id)) {
        exitososV++;
        testValesCreados.push(res.data?.data?.id ?? res.data?.id);
      } else {
        fallosV.push({ item: i, status: res.status, error: res.data });
      }
    }
    const duracionV = ((performance.now() - inicioV) / 1000).toFixed(2);
    console.log(`[TEST VALES 200]: ${exitososV}/${CANTIDAD} exitosos en ${duracionV}s (${((Number(duracionV) / CANTIDAD) * 1000).toFixed(1)}ms/req)`);
    expect(fallosV).toHaveLength(0);
    expect(exitososV).toBe(CANTIDAD);
  }, 60000);

  it("Permite editar Listado en estado PENDIENTE y EN_PROCESO (SEPARADO), y rechaza cuando está DESCONTADO", async () => {
    const timestamp = Date.now();
    // 1. Crear listado en PENDIENTE
    const createRes = await requestApi("POST", "/listados", {
      numeroListado: `TST-L-EDIT-${timestamp}`,
      lineaProduccionId: lineaId,
      fechaRequerida: "2026-12-01",
    });
    expect(createRes.status).toBe(201);
    const listadoId = createRes.data.data.id;
    testListadosCreados.push(listadoId);

    // 2. Editar en PENDIENTE -> debe permitirlo
    const editPendiente = await requestApi("PATCH", `/listados/${listadoId}`, {
      numeroListado: `TST-L-EDITED-P-${timestamp}`,
    });
    expect(editPendiente.status).toBe(200);
    expect(editPendiente.data.data.numeroListado).toBe(`TST-L-EDITED-P-${timestamp}`);

    // 3. Avanzar a SEPARADO (EN_PROCESO)
    await requestApi("POST", `/listados/${listadoId}/separar`, { tipoFrente: "DIRECTOS" });

    // 4. Editar en EN_PROCESO -> debe permitirlo sin error
    const editEnProceso = await requestApi("PATCH", `/listados/${listadoId}`, {
      numeroListado: `TST-L-EDITED-PROC-${timestamp}`,
    });
    expect(editEnProceso.status).toBe(200);
    expect(editEnProceso.data.data.numeroListado).toBe(`TST-L-EDITED-PROC-${timestamp}`);

    // 5. Avanzar a ENTREGADO y luego DESCONTADO en todos sus frentes
    await requestApi("POST", `/listados/${listadoId}/entregar`, { tipoFrente: "DIRECTOS" });
    await requestApi("POST", `/listados/${listadoId}/descontar`, { tipoFrente: "DIRECTOS" });

    await requestApi("POST", `/listados/${listadoId}/separar`, { tipoFrente: "INDIRECTOS" });
    await requestApi("POST", `/listados/${listadoId}/entregar`, { tipoFrente: "INDIRECTOS" });
    await requestApi("POST", `/listados/${listadoId}/descontar`, { tipoFrente: "INDIRECTOS" });

    // 6. Editar en DESCONTADO -> debe ser rechazado con 409
    const editDescontado = await requestApi("PATCH", `/listados/${listadoId}`, {
      numeroListado: `TST-L-FAIL-DESC-${timestamp}`,
    });
    expect(editDescontado.status).toBe(409);
    expect(editDescontado.data.message).toContain("debe retroceder primero el descuento");
  }, 15000);

  it("Permite editar Vale en estado PENDIENTE y SEPARADO, y rechaza cuando está DESCONTADO", async () => {
    const timestamp = Date.now();
    // 1. Crear vale en PENDIENTE
    const createRes = await requestApi("POST", "/vales", {
      serieId,
      folio: `FOL-EDIT-${timestamp}`,
      departamentoValeId: deptoValeId,
      fechaSolicitud: "2026-12-01",
    });
    expect(createRes.status).toBe(201);
    const valeId = createRes.data?.data?.id ?? createRes.data?.id;
    testValesCreados.push(valeId);

    // 2. Editar en PENDIENTE -> debe permitirlo
    const editPendiente = await requestApi("PUT", `/vales/${valeId}`, {
      folio: `FOL-ED-P-${timestamp}`,
    });
    expect(editPendiente.status).toBe(200);
    expect(editPendiente.data.data.folio).toBe(`FOL-ED-P-${timestamp}`);

    // 3. Separar vale -> estado pasa a SEPARADO
    await requestApi("POST", `/vales/${valeId}/separar`, {});

    // 4. Editar en SEPARADO -> debe permitirlo sin error
    const editSeparado = await requestApi("PUT", `/vales/${valeId}`, {
      folio: `FOL-ED-SEP-${timestamp}`,
    });
    expect(editSeparado.status).toBe(200);
    expect(editSeparado.data.data.folio).toBe(`FOL-ED-SEP-${timestamp}`);

    // 5. Entregar y Descontar
    await requestApi("POST", `/vales/${valeId}/entregar`, {});
    await requestApi("POST", `/vales/${valeId}/descontar`, {});

    // 6. Editar en DESCONTADO -> debe ser rechazado con 409
    const editDescontado = await requestApi("PUT", `/vales/${valeId}`, {
      folio: `FOL-FAIL-DESC-${timestamp}`,
    });
    expect(editDescontado.status).toBe(409);
    expect(editDescontado.data.message).toContain("debe retroceder primero el descuento");
  }, 15000);

  it("8. REGISTRADOR puede consultar el historial completo de su departamento sin restricción forzada a PENDIENTE", async () => {
    // 1. Obtener o crear un usuario con rol REGISTRADOR
    let regUser = await prisma.usuario.findFirst({
      where: {
        estado: "ACTIVO",
        rol: { codigo: "REGISTRADOR", estado: "ACTIVO" },
      },
      include: { rol: true },
    });

    const defaultPassword = "123456789";
    const defaultPasswordHash = securityService.hashPassword(defaultPassword);
    const defaultPasswordEncrypted = securityService.encryptPassword(defaultPassword);

    if (!regUser) {
      const depto = await prisma.departamento.findFirst({ where: { estado: "ACTIVO" } });
      const rolReg = await prisma.rol.findFirst({ where: { codigo: "REGISTRADOR" } });
      if (!depto || !rolReg) throw new Error("Falta catálogo para crear usuario registrador");

      regUser = await prisma.usuario.create({
        data: {
          usuario: `reg_test_${Date.now()}`,
          nombre: "Registrador Test",
          passwordHash: defaultPasswordHash,
          passwordEncrypted: defaultPasswordEncrypted,
          departamentoId: depto.id,
          rolId: rolReg.id,
          estado: "ACTIVO",
        },
        include: { rol: true },
      });
    } else {
      await prisma.usuario.update({
        where: { id: regUser.id },
        data: {
          passwordHash: defaultPasswordHash,
          passwordEncrypted: defaultPasswordEncrypted,
        },
      });
    }

    // 2. Login como REGISTRADOR
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: regUser.usuario, password: defaultPassword }),
    });
    const loginJson = (await loginRes.json()) as any;
    expect(loginRes.status).toBe(200);
    const regToken = loginJson.data.accessToken;

    // 3. Crear un listado y avanzarlo a DESCONTADO en el departamento del registrador
    const timestamp = Date.now();
    const numeroListado = `TST-L-REG-${timestamp}`;
    const lineaReg = await prisma.lineaProduccion.findFirst({
      where: { departamentoId: regUser.departamentoId, estado: "ACTIVO" },
    }) ?? await prisma.lineaProduccion.findFirst({ where: { estado: "ACTIVO" } });
    if (!lineaReg) throw new Error("No hay línea activa");

    const todayStr = new Date().toISOString().slice(0, 10);
    const createRes = await requestApi("POST", "/listados", {
      numeroListado,
      lineaProduccionId: lineaReg.id,
      fechaRequerida: todayStr,
    });
    expect(createRes.status).toBe(201);
    const listadoId = createRes.data.data.id;
    testListadosCreados.push(listadoId);

    // Avanzar a SEPARADO, ENTREGADO y DESCONTADO en todos sus frentes
    const frentes = await prisma.listadoSurtidoFrente.findMany({ where: { listadoMaterialId: listadoId } });
    for (const f of frentes) {
      await requestApi("POST", `/listados/${listadoId}/separar`, { tipoFrente: f.tipoFrente });
      await requestApi("POST", `/listados/${listadoId}/entregar`, { tipoFrente: f.tipoFrente });
      await requestApi("POST", `/listados/${listadoId}/descontar`, { tipoFrente: f.tipoFrente });
    }

    // 4. El REGISTRADOR consulta listados generales (Historial) sin filtro de estado
    const historialRes = await fetch(`http://127.0.0.1:${port}/api/v1/listados?numeroListado=${numeroListado}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${regToken}`,
      },
    });
    expect(historialRes.status).toBe(200);
    const historialJson = (await historialRes.json()) as any;
    expect(historialJson.data.items.length).toBe(1);
    expect(historialJson.data.items[0].id).toBe(listadoId);
    expect(historialJson.data.items[0].estado).toBe("DESCONTADO");
  }, 20000);

  it("9. AUDITOR puede retroceder un vale en estado ENTREGADO a PENDIENTE con motivo obligatorio", async () => {
    // 1. Obtener o crear un usuario con rol AUDITOR
    let auditorUser = await prisma.usuario.findFirst({
      where: {
        estado: "ACTIVO",
        rol: { codigo: "AUDITOR", estado: "ACTIVO" },
      },
      include: { rol: true },
    });

    const defaultPassword = "123456789";
    const defaultPasswordHash = securityService.hashPassword(defaultPassword);
    const defaultPasswordEncrypted = securityService.encryptPassword(defaultPassword);

    if (!auditorUser) {
      const depto = await prisma.departamento.findFirst({ where: { estado: "ACTIVO" } });
      const rolAud = await prisma.rol.findFirst({ where: { codigo: "AUDITOR" } });
      if (!depto || !rolAud) throw new Error("Falta catálogo para crear usuario auditor");

      auditorUser = await prisma.usuario.create({
        data: {
          usuario: `aud_test_${Date.now()}`,
          nombre: "Auditor Test",
          passwordHash: defaultPasswordHash,
          passwordEncrypted: defaultPasswordEncrypted,
          departamentoId: depto.id,
          rolId: rolAud.id,
          estado: "ACTIVO",
        },
        include: { rol: true },
      });
    } else {
      await prisma.usuario.update({
        where: { id: auditorUser.id },
        data: {
          passwordHash: defaultPasswordHash,
          passwordEncrypted: defaultPasswordEncrypted,
        },
      });
    }

    // 2. Login como AUDITOR
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: auditorUser.usuario, password: defaultPassword }),
    });
    const loginJson = (await loginRes.json()) as any;
    expect(loginRes.status).toBe(200);
    const audToken = loginJson.data.accessToken;

    // 3. Crear vale, separarlo y entregarlo para que quede en ENTREGADO
    const timestamp = Date.now();
    const createValeRes = await requestApi("POST", "/vales", {
      serieId,
      folio: `FOL-AUD-${timestamp}`,
      departamentoValeId: deptoValeId,
      fechaSolicitud: "2026-12-01",
    });
    expect(createValeRes.status).toBe(201);
    const valeId = createValeRes.data.data.id;
    testValesCreados.push(valeId);

    await requestApi("POST", `/vales/${valeId}/separar`, {});
    await requestApi("POST", `/vales/${valeId}/entregar`, {});

    // 4. El AUDITOR ejecuta el retroceso de ENTREGADO -> PENDIENTE con motivo
    const retrocederRes = await fetch(`http://127.0.0.1:${port}/api/v1/vales/${valeId}/retroceder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${audToken}`,
      },
      body: JSON.stringify({
        motivo: "Material defectuoso o no conforme",
        estadoDestino: "PENDIENTE",
      }),
    });
    expect(retrocederRes.status).toBe(200);
    const retrocederJson = (await retrocederRes.json()) as any;
    expect(retrocederJson.data.estado).toBe("PENDIENTE");
    expect(retrocederJson.data.motivoReversion).toBe("Material defectuoso o no conforme");
  }, 20000);
});
