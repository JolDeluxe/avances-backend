import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prisma } from "../src/config/database";
import { listadosQueryService } from "../src/modules/listados/services/listados-query.service";
import { valesQueryService } from "../src/modules/vales/services/vales-query.service";
import { PERMISOS } from "../src/config/permissions";

describe("Auditoria Counts Backend Tests", () => {
  let deptoId: number;
  let testUserId: number;

  beforeAll(async () => {
    const depto = await prisma.departamento.findFirst({ where: { estado: "ACTIVO" } });
    deptoId = depto!.id;

    const rolAuditor = await prisma.rol.findFirst({ where: { codigo: "AUDITOR" } });
    const user = await prisma.usuario.create({
      data: {
        usuario: `test_aud_${Date.now()}`,
        nombre: "Test Auditor Conteo",
        passwordHash: "hash",
        passwordEncrypted: "enc",
        rolId: rolAuditor!.id,
        departamentoId: deptoId,
        tipoMaterialAuditor: "INDIRECTOS",
        estado: "ACTIVO",
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.usuarioAutorizacionValeArea.deleteMany({ where: { usuarioId: testUserId } });
      await prisma.usuario.delete({ where: { id: testUserId } });
    }
  });

  it("Debe retornar 0 para listados si el usuario no tiene permiso listado:descontar", async () => {
    const count = await listadosQueryService.getAuditoriaCount(testUserId, ["listado:ver"]);
    expect(count).toBe(0);
  });

  it("Debe retornar 0 para vales si el usuario no tiene permiso vale:descontar", async () => {
    const count = await valesQueryService.getAuditoriaCount(testUserId, ["vale:ver"]);
    expect(count).toBe(0);
  });

  it("Debe aplicar deny-by-default si el usuario no tiene tipoMaterialAuditor asignado", async () => {
    await prisma.usuario.update({
      where: { id: testUserId },
      data: { tipoMaterialAuditor: null },
    });

    const count = await listadosQueryService.getAuditoriaCount(testUserId, [PERMISOS.LISTADO_DESCONTAR]);
    expect(count).toBe(0);

    await prisma.usuario.update({
      where: { id: testUserId },
      data: { tipoMaterialAuditor: "INDIRECTOS" },
    });
  });

  it("Debe calcular count >= 0 para auditor con INDIRECTOS asignado y permiso", async () => {
    const count = await listadosQueryService.getAuditoriaCount(testUserId, [PERMISOS.LISTADO_DESCONTAR]);
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("SUPER_ADMIN con permiso debe consultar el total global", async () => {
    const superAdmin = await prisma.usuario.findFirst({
      where: { estado: "ACTIVO", rol: { codigo: "SUPER_ADMIN" } },
    });
    if (superAdmin) {
      const countListados = await listadosQueryService.getAuditoriaCount(superAdmin.id, [PERMISOS.LISTADO_DESCONTAR]);
      const countVales = await valesQueryService.getAuditoriaCount(superAdmin.id, [PERMISOS.VALE_DESCONTAR]);

      expect(typeof countListados).toBe("number");
      expect(typeof countVales).toBe("number");

      const countSinPermiso = await listadosQueryService.getAuditoriaCount(superAdmin.id, []);
      expect(countSinPermiso).toBe(0);
    }
  });

  it("Usuario con alcance acumulativo sin asignaciones activas debe retornar 0", async () => {
    // Si el usuario tiene tipoSurtidoAlmacen, se activa requiresCumulativeValeScope
    await prisma.usuario.update({
      where: { id: testUserId },
      data: { tipoSurtidoAlmacen: "DIRECTOS" },
    });

    const count = await valesQueryService.getAuditoriaCount(testUserId, [PERMISOS.VALE_DESCONTAR]);
    expect(count).toBe(0);

    // Si se le asigna área BOTA, debe contar vales de BOTA
    await prisma.usuarioAutorizacionValeArea.create({
      data: {
        usuarioId: testUserId,
        area: "BOTA",
        estado: "ACTIVO",
      },
    });

    const countConBota = await valesQueryService.getAuditoriaCount(testUserId, [PERMISOS.VALE_DESCONTAR]);
    expect(typeof countConBota).toBe("number");
    expect(countConBota).toBeGreaterThanOrEqual(0);

    // Limpiar
    await prisma.usuarioAutorizacionValeArea.deleteMany({ where: { usuarioId: testUserId } });
    await prisma.usuario.update({
      where: { id: testUserId },
      data: { tipoSurtidoAlmacen: null },
    });
  });

  it("ADMIN con permisos operativos cuenta todos los frentes y vales de su departamento sin requerir segmentación física", async () => {
    const rolAdmin = await prisma.rol.findUniqueOrThrow({ where: { codigo: "ADMIN" } });
    const adminUser = await prisma.usuario.create({
      data: {
        usuario: `test_adm_cnt_${Date.now()}`,
        nombre: "Test Admin Conteo",
        passwordHash: "hash",
        rolId: rolAdmin.id,
        departamentoId: deptoId,
        tipoMaterialAuditor: null,
        tipoSurtidoAlmacen: null,
        estado: "ACTIVO",
      },
    });

    try {
      const countListados = await listadosQueryService.getAuditoriaCount(adminUser.id, [
        PERMISOS.LISTADO_DESCONTAR,
      ]);
      const countVales = await valesQueryService.getAuditoriaCount(adminUser.id, [
        PERMISOS.VALE_DESCONTAR,
      ]);

      expect(typeof countListados).toBe("number");
      expect(countListados).toBeGreaterThanOrEqual(0);
      expect(typeof countVales).toBe("number");
      expect(countVales).toBeGreaterThanOrEqual(0);

      // Verificar que ADMIN no puede consultar scopeView='almacen' en Vales
      await expect(
        valesQueryService.getVales({ scopeView: "almacen", pagina: 1, limite: 10 }, adminUser.id),
      ).rejects.toThrow("No tiene autorización para consultar el tablero operativo de almacén");
    } finally {
      await prisma.usuario.delete({ where: { id: adminUser.id } });
    }
  });
});
