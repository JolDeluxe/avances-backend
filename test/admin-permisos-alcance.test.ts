import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { prisma } from "../src/config/database";
import { PERMISOS } from "../src/config/permissions";
import { calcularPermisosEfectivos } from "../src/modules/auth/services/permission.service";
import { scopeService } from "../src/modules/auth/services/scope.service";
import { securityService } from "../src/modules/auth/services/security.service";

describe("Permisos Base, Alcance Departamental de ADMIN y Restricción de Almacén", () => {
  const app = createApp();
  let server: Server | undefined;
  let port: number;

  let deptoMPId: number;
  let deptoPielesId: number;
  let lineaBolsasId: number;
  let serieValeId: number;
  let deptoValeBotaId: number;

  let rolAdminId: number;
  let rolAuditorId: number;
  let rolAlmacenistaId: number;

  let adminMPId: number;
  let adminPielesId: number;
  let tokenAdminMP: string;
  let tokenAdminPieles: string;

  const createdUserIds: number[] = [];
  const createdListadoIds: number[] = [];
  const createdValeIds: number[] = [];
  let createdLineaPielesId: number | null = null;

  const defaultHash = securityService.hashPassword("TestAdmin123!");

  const apiCall = async (
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as any;
    return { status: res.status, json };
  };

  beforeAll(async () => {
    server = app.listen(0);
    const addr = server.address();
    port = typeof addr === "object" && addr ? addr.port : 3000;

    const [deptoMP, deptoPieles, rolAdmin, rolAud, rolAlm] = await Promise.all([
      prisma.departamento.findUniqueOrThrow({ where: { codigo: "MATERIA_PRIMA" } }),
      prisma.departamento.findUniqueOrThrow({ where: { codigo: "PIELES" } }),
      prisma.rol.findUniqueOrThrow({ where: { codigo: "ADMIN" } }),
      prisma.rol.findUniqueOrThrow({ where: { codigo: "AUDITOR" } }),
      prisma.rol.findUniqueOrThrow({ where: { codigo: "ALMACENISTA" } }),
    ]);

    deptoMPId = deptoMP.id;
    deptoPielesId = deptoPieles.id;
    rolAdminId = rolAdmin.id;
    rolAuditorId = rolAud.id;
    rolAlmacenistaId = rolAlm.id;

    // Buscar una línea en MATERIA_PRIMA que permita BOLSAS (o BOLSAS)
    const lineaBolsas =
      (await prisma.lineaProduccion.findFirst({
        where: {
          departamentoId: deptoMPId,
          estado: "ACTIVO",
          OR: [{ permiteBolsas: true }, { codigo: "BOLSAS" }],
        },
      })) ??
      (await prisma.lineaProduccion.findFirstOrThrow({
        where: { departamentoId: deptoMPId, estado: "ACTIVO" },
      }));
    lineaBolsasId = lineaBolsas.id;

    // Serie y departamento operativo de Vales
    const serie = await prisma.serieVale.findFirstOrThrow({
      where: { departamentoId: deptoMPId, estado: "ACTIVO" },
    });
    serieValeId = serie.id;

    const deptoVale = await prisma.departamentoVale.findFirstOrThrow({
      where: { departamentoId: deptoMPId, estado: "ACTIVO" },
    });
    deptoValeBotaId = deptoVale.id;

    // Crear ADMIN de MATERIA_PRIMA (con campos de segmentación estrictamente en null)
    const uAdminMP = await prisma.usuario.create({
      data: {
        usuario: `adm_mp_${Date.now()}`,
        nombre: "Admin Materia Prima Test",
        passwordHash: defaultHash,
        rolId: rolAdminId,
        departamentoId: deptoMPId,
        tipoSurtidoAlmacen: null,
        tipoMaterialAuditor: null,
        estado: "ACTIVO",
      },
    });
    createdUserIds.push(uAdminMP.id);
    adminMPId = uAdminMP.id;

    // Crear ADMIN de PIELES
    const uAdminPieles = await prisma.usuario.create({
      data: {
        usuario: `adm_pieles_${Date.now()}`,
        nombre: "Admin Pieles Test",
        passwordHash: defaultHash,
        rolId: rolAdminId,
        departamentoId: deptoPielesId,
        tipoSurtidoAlmacen: null,
        tipoMaterialAuditor: null,
        estado: "ACTIVO",
      },
    });
    createdUserIds.push(uAdminPieles.id);
    adminPielesId = uAdminPieles.id;

    // Calcular permisos efectivos reales desde la BD para ambos ADMIN
    const permsMP = await calcularPermisosEfectivos(adminMPId);
    tokenAdminMP = securityService.generateAccessToken({
      usuarioId: uAdminMP.id,
      usuario: uAdminMP.usuario,
      rolId: uAdminMP.rolId,
      departamentoId: uAdminMP.departamentoId,
      permisos: permsMP,
      versionPermisos: uAdminMP.versionPermisos,
    });

    const permsPieles = await calcularPermisosEfectivos(adminPielesId);
    tokenAdminPieles = securityService.generateAccessToken({
      usuarioId: uAdminPieles.id,
      usuario: uAdminPieles.usuario,
      rolId: uAdminPieles.rolId,
      departamentoId: uAdminPieles.departamentoId,
      permisos: permsPieles,
      versionPermisos: uAdminPieles.versionPermisos,
    });
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }

    for (const vid of createdValeIds) {
      await prisma.historialEstadoVale.deleteMany({ where: { valeId: vid } });
      await prisma.valeMaterial.delete({ where: { id: vid } }).catch(() => {});
    }

    for (const lid of createdListadoIds) {
      await prisma.historialEstadoFrente.deleteMany({
        where: { frente: { listadoMaterialId: lid } },
      });
      await prisma.listadoSurtidoFrente.deleteMany({
        where: { listadoMaterialId: lid },
      });
      await prisma.historialEstadoListado.deleteMany({
        where: { listadoMaterialId: lid },
      });
      await prisma.listadoMaterial.delete({ where: { id: lid } }).catch(() => {});
    }

    if (createdLineaPielesId) {
      await prisma.lineaProduccion.delete({ where: { id: createdLineaPielesId } }).catch(() => {});
    }

    if (createdUserIds.length > 0) {
      await prisma.excepcionPermisoUsuario.deleteMany({
        where: { usuarioId: { in: createdUserIds } },
      });
      await prisma.registroAuditoria.deleteMany({
        where: { usuarioId: { in: createdUserIds } },
      });
      await prisma.usuario.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  it("1. Permisos efectivos de ADMIN incluyen los 9 permisos operativos de LISTADOS y VALES y sus campos de segmentación permanecen en null", async () => {
    const permisos = await calcularPermisosEfectivos(adminMPId);

    const esperados = [
      PERMISOS.LISTADO_VER,
      PERMISOS.LISTADO_CREAR,
      PERMISOS.LISTADO_EDITAR,
      PERMISOS.LISTADO_CANCELAR,
      PERMISOS.LISTADO_SEPARAR,
      PERMISOS.LISTADO_ENTREGAR,
      PERMISOS.LISTADO_DESCONTAR,
      PERMISOS.LISTADO_RETROCEDER,
      PERMISOS.VALE_VER,
      PERMISOS.VALE_CREAR,
      PERMISOS.VALE_EDITAR,
      PERMISOS.VALE_CANCELAR,
      PERMISOS.VALE_SEPARAR,
      PERMISOS.VALE_ENTREGAR,
      PERMISOS.VALE_DESCONTAR,
      PERMISOS.VALE_RETROCEDER,
      PERMISOS.VALE_RETROCEDER_DESCUENTO,
    ];

    for (const p of esperados) {
      expect(permisos).toContain(p);
    }

    const scope = await scopeService.resolveUserScope(adminMPId);
    expect(scope.esGlobal).toBe(false);
    expect(scope.tipoSurtidoAlmacen).toBeNull();
    expect(scope.tipoMaterialAuditor).toBeNull();
    expect(scopeService.hasDepartmentalOperationalScope(scope)).toBe(true);
  });

  it("2. Las excepciones individuales (DENEGAR) prevalecen sobre los permisos base del rol ADMIN", async () => {
    const permDescontar = await prisma.permiso.findUniqueOrThrow({
      where: { codigo: PERMISOS.LISTADO_DESCONTAR },
    });

    await prisma.excepcionPermisoUsuario.create({
      data: {
        usuarioId: adminMPId,
        permisoId: permDescontar.id,
        accion: "DENEGAR",
        estado: "ACTIVO",
      },
    });

    try {
      const permisosConExcepcion = await calcularPermisosEfectivos(adminMPId);
      expect(permisosConExcepcion).not.toContain(PERMISOS.LISTADO_DESCONTAR);
      expect(permisosConExcepcion).toContain(PERMISOS.LISTADO_SEPARAR);
    } finally {
      await prisma.excepcionPermisoUsuario.deleteMany({
        where: { usuarioId: adminMPId, permisoId: permDescontar.id },
      });
    }
  });

  it("3. ADMIN puede operar DIRECTOS, INDIRECTOS y BOLSAS (separar, entregar, retroceder y descontar) dentro de su departamento y actualiza el contador de auditoría", async () => {
    const countInicialRes = await apiCall("GET", "/listados/auditoria/count", tokenAdminMP);
    expect(countInicialRes.status).toBe(200);
    const countInicial = countInicialRes.json.data.count as number;

    const listado = await prisma.listadoMaterial.create({
      data: {
        numeroListado: `ADM-FULL-${Date.now()}`,
        departamentoId: deptoMPId,
        lineaProduccionId: lineaBolsasId,
        fechaRequerida: new Date(Date.now() + 86400000),
        estado: "PENDIENTE",
        creadoPorUsuarioId: adminMPId,
        frentes: {
          create: [
            { tipoFrente: "DIRECTOS", estado: "PENDIENTE" },
            { tipoFrente: "INDIRECTOS", estado: "PENDIENTE" },
            { tipoFrente: "BOLSAS", estado: "PENDIENTE" },
          ],
        },
      },
    });
    createdListadoIds.push(listado.id);

    for (const frente of ["DIRECTOS", "INDIRECTOS", "BOLSAS"] as const) {
      // Separar
      const resSep = await apiCall("POST", `/listados/${listado.id}/separar`, tokenAdminMP, {
        tipoFrente: frente,
      });
      expect(resSep.status).toBe(200);

      // Retroceder desde SEPARADO -> PENDIENTE y volver a separar
      const resRet = await apiCall("POST", `/listados/${listado.id}/retroceder`, tokenAdminMP, {
        tipoFrente: frente,
        motivo: "Prueba retroceso admin",
      });
      expect(resRet.status).toBe(200);

      const resSep2 = await apiCall("POST", `/listados/${listado.id}/separar`, tokenAdminMP, {
        tipoFrente: frente,
      });
      expect(resSep2.status).toBe(200);

      // Entregar
      const resEnt = await apiCall("POST", `/listados/${listado.id}/entregar`, tokenAdminMP, {
        tipoFrente: frente,
      });
      expect(resEnt.status).toBe(200);
    }

    // Al tener frentes en ENTREGADO, el contador de auditoría del ADMIN aumenta en 1
    const countEntregadoRes = await apiCall("GET", "/listados/auditoria/count", tokenAdminMP);
    expect(countEntregadoRes.status).toBe(200);
    expect(countEntregadoRes.json.data.count).toBe(countInicial + 1);

    // Descontar los 3 frentes
    for (const frente of ["DIRECTOS", "INDIRECTOS", "BOLSAS"] as const) {
      const resDesc = await apiCall("POST", `/listados/${listado.id}/descontar`, tokenAdminMP, {
        tipoFrente: frente,
      });
      expect(resDesc.status).toBe(200);
    }

    // Al quedar todos descontados, el contador regresa a su valor inicial
    const countFinalRes = await apiCall("GET", "/listados/auditoria/count", tokenAdminMP);
    expect(countFinalRes.status).toBe(200);
    expect(countFinalRes.json.data.count).toBe(countInicial);
  });

  it("4. ADMIN puede separar, entregar, descontar y retroceder descuento en VALES de su departamento y actualiza el contador de auditoría", async () => {
    const countInicialRes = await apiCall("GET", "/vales/auditoria/count", tokenAdminMP);
    expect(countInicialRes.status).toBe(200);
    const countInicial = countInicialRes.json.data.count as number;

    const vale = await prisma.valeMaterial.create({
      data: {
        folio: `V-ADM-${Date.now().toString().slice(-6)}`,
        departamentoId: deptoMPId,
        serieId: serieValeId,
        departamentoValeId: deptoValeBotaId,
        area: "BOTA",
        fechaSolicitud: new Date(),
        estado: "PENDIENTE",
        creadoPorId: adminMPId,
      },
    });
    createdValeIds.push(vale.id);

    // Separar y entregar
    const resSep = await apiCall("POST", `/vales/${vale.id}/separar`, tokenAdminMP, {
      entregarTambien: true,
    });
    expect(resSep.status).toBe(200);
    expect(resSep.json.data.estado).toBe("ENTREGADO");

    // Contador de vales para ADMIN aumenta en 1
    const countEntregadoRes = await apiCall("GET", "/vales/auditoria/count", tokenAdminMP);
    expect(countEntregadoRes.status).toBe(200);
    expect(countEntregadoRes.json.data.count).toBe(countInicial + 1);

    // Descontar vale
    const resDesc = await apiCall("POST", `/vales/${vale.id}/descontar`, tokenAdminMP, {});
    expect(resDesc.status).toBe(200);
    expect(resDesc.json.data.estado).toBe("DESCONTADO");

    // Contador disminuye tras descontar
    const countPostDescRes = await apiCall("GET", "/vales/auditoria/count", tokenAdminMP);
    expect(countPostDescRes.status).toBe(200);
    expect(countPostDescRes.json.data.count).toBe(countInicial);

    // Retroceder descuento (DESCONTADO -> ENTREGADO) usando vale:retroceder_descuento
    const resRetDesc = await apiCall("POST", `/vales/${vale.id}/retroceder`, tokenAdminMP, {
      motivo: "Corrección administrativa de descuento",
    });
    expect(resRetDesc.status).toBe(200);
    expect(resRetDesc.json.data.estado).toBe("ENTREGADO");
  });

  it("5. Aislamiento departamental: ADMIN de otro departamento (PIELES) no puede operar listados ni vales de MATERIA_PRIMA", async () => {
    const listadoMPId = createdListadoIds[0]!;
    const valeMPId = createdValeIds[0]!;

    const resListado = await apiCall("GET", `/listados/${listadoMPId}`, tokenAdminPieles);
    expect(resListado.status).toBe(404);

    const resVale = await apiCall("POST", `/vales/${valeMPId}/descontar`, tokenAdminPieles, {});
    expect(resVale.status).toBe(404);
  });

  it("6. Restricción de Almacén: ADMIN es rechazado con 403 al consultar scopeView=almacen en Vales, pero puede consultar general/pendientes/auditoria", async () => {
    const resAlmacen = await apiCall("GET", "/vales?scopeView=almacen", tokenAdminMP);
    expect(resAlmacen.status).toBe(403);
    expect(resAlmacen.json.message).toContain("tablero operativo de almacén");

    const resGeneral = await apiCall("GET", "/vales?scopeView=general", tokenAdminMP);
    expect(resGeneral.status).toBe(200);

    const resAuditoria = await apiCall("GET", "/vales?scopeView=auditoria", tokenAdminMP);
    expect(resAuditoria.status).toBe(200);
  });
});
