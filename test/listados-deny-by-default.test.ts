import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { prisma } from "../src/config/database";
import { securityService } from "../src/modules/auth/services/security.service";
import { PERMISOS } from "../src/config/permissions";
import { listadosLifecycleService } from "../src/modules/listados/services/listados-lifecycle.service";

describe("Validación Estricta Deny-by-Default en Listados (Backend)", () => {
  const app = createApp();
  let server: Server | undefined;
  let port: number;

  let deptoId: number;
  let lineaId: number;
  let listadoTestId: number;
  let listadoRetrocesoId: number;

  // Roles
  let rolSuperAdminId: number;
  let rolAdminId: number;
  let rolAlmacenistaId: number;
  let rolAuditorId: number;

  // IDs de usuarios para invocaciones directas de servicio
  let idUserSuperAdmin: number;
  let idUserAlmDirectos: number;
  let idUserAudDirectos: number;

  // Tokens de prueba
  let tokenSuperAdmin: string;
  let tokenAlmDirectos: string;
  let tokenAlmTodos: string;
  let tokenAlmNullScope: string;
  let tokenAlmEmptyScope: string;
  let tokenAudDirectos: string;
  let tokenAudTodos: string;
  let tokenAudNullScope: string;
  let tokenAdminSinAlcance: string;
  let tokenUsuarioSinPermiso: string;
  let tokenAdminSoloVer: string;

  // Usuarios creados para cleanup
  const createdUserIds: number[] = [];

  const defaultHash = securityService.hashPassword("TestPass123!");

  const getFrenteEstado = async (listadoId: number, tipoFrente: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = await prisma.listadoSurtidoFrente.findFirst({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { listadoMaterialId: listadoId, tipoFrente: tipoFrente as any },
    });
    return f?.estado;
  };

  type ApiJson = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    message?: string;
    errors?: Array<{ field?: string; message: string }>;
    [key: string]: unknown;
  };

  const requestApi = async (
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<{ status: number; json: ApiJson }> => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/listados${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as ApiJson;
    return { status: res.status, json };
  };

  beforeAll(async () => {
    server = app.listen(0);
    const address = server.address();
    port = typeof address === "object" && address ? address.port : 3000;

    const depto = await prisma.departamento.findUniqueOrThrow({ where: { codigo: "MATERIA_PRIMA" } });
    deptoId = depto.id;

    const linea = await prisma.lineaProduccion.findFirstOrThrow({
      where: { departamentoId: deptoId, estado: "ACTIVO" },
    });
    lineaId = linea.id;

    // Obtener roles
    const [rSA, rAdmin, rAlm, rAud] = await Promise.all([
      prisma.rol.findUniqueOrThrow({ where: { codigo: "SUPER_ADMIN" } }),
      prisma.rol.findUniqueOrThrow({ where: { codigo: "ADMIN" } }),
      prisma.rol.findUniqueOrThrow({ where: { codigo: "ALMACENISTA" } }),
      prisma.rol.findUniqueOrThrow({ where: { codigo: "AUDITOR" } }),
    ]);
    rolSuperAdminId = rSA.id;
    rolAdminId = rAdmin.id;
    rolAlmacenistaId = rAlm.id;
    rolAuditorId = rAud.id;

    // Helper para crear usuario de prueba
    const createTestUser = async (
      usuarioName: string,
      rolId: number,
      tipoSurtido: string | null,
      tipoAuditor: string | null,
    ) => {
      const u = await prisma.usuario.create({
        data: {
          usuario: `${usuarioName}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          nombre: `Test ${usuarioName}`,
          passwordHash: defaultHash,
          departamentoId: deptoId,
          rolId,
          tipoSurtidoAlmacen: tipoSurtido,
          tipoMaterialAuditor: tipoAuditor,
          estado: "ACTIVO",
          lineasAsignadas: {
            create: [{ lineaProduccionId: lineaId, estado: "ACTIVO" }],
          },
        },
      });
      createdUserIds.push(u.id);
      return u;
    };

    // 1. Super Admin
    const uSA = await createTestUser("t_sa", rolSuperAdminId, null, null);
    idUserSuperAdmin = uSA.id;
    tokenSuperAdmin = securityService.generateAccessToken({
      usuarioId: uSA.id,
      usuario: uSA.usuario,
      rolId: uSA.rolId,
      departamentoId: uSA.departamentoId,
      permisos: [
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_SEPARAR,
        PERMISOS.LISTADO_ENTREGAR,
        PERMISOS.LISTADO_DESCONTAR,
        PERMISOS.LISTADO_RETROCEDER,
      ],
    });

    // 2. Almacenista con frente DIRECTOS
    const uAlmDir = await createTestUser("t_alm_dir", rolAlmacenistaId, "DIRECTOS", null);
    idUserAlmDirectos = uAlmDir.id;
    tokenAlmDirectos = securityService.generateAccessToken({
      usuarioId: uAlmDir.id,
      usuario: uAlmDir.usuario,
      rolId: uAlmDir.rolId,
      departamentoId: uAlmDir.departamentoId,
      permisos: [
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_SEPARAR,
        PERMISOS.LISTADO_ENTREGAR,
        PERMISOS.LISTADO_RETROCEDER,
      ],
    });

    // 3. Almacenista con TODOS
    const uAlmTodos = await createTestUser("t_alm_todos", rolAlmacenistaId, "TODOS", null);
    tokenAlmTodos = securityService.generateAccessToken({
      usuarioId: uAlmTodos.id,
      usuario: uAlmTodos.usuario,
      rolId: uAlmTodos.rolId,
      departamentoId: uAlmTodos.departamentoId,
      permisos: [
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_SEPARAR,
        PERMISOS.LISTADO_ENTREGAR,
        PERMISOS.LISTADO_RETROCEDER,
      ],
    });

    // 4. Almacenista con asignación null
    const uAlmNull = await createTestUser("t_alm_null", rolAlmacenistaId, null, null);
    tokenAlmNullScope = securityService.generateAccessToken({
      usuarioId: uAlmNull.id,
      usuario: uAlmNull.usuario,
      rolId: uAlmNull.rolId,
      departamentoId: uAlmNull.departamentoId,
      permisos: [
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_SEPARAR,
        PERMISOS.LISTADO_ENTREGAR,
        PERMISOS.LISTADO_RETROCEDER,
      ],
    });

    // 5. Almacenista con asignación vacía ""
    const uAlmEmpty = await createTestUser("t_alm_empty", rolAlmacenistaId, "", null);
    tokenAlmEmptyScope = securityService.generateAccessToken({
      usuarioId: uAlmEmpty.id,
      usuario: uAlmEmpty.usuario,
      rolId: uAlmEmpty.rolId,
      departamentoId: uAlmEmpty.departamentoId,
      permisos: [
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_SEPARAR,
        PERMISOS.LISTADO_ENTREGAR,
        PERMISOS.LISTADO_RETROCEDER,
      ],
    });

    // 6. Auditor con DIRECTOS
    const uAudDir = await createTestUser("t_aud_dir", rolAuditorId, null, "DIRECTOS");
    idUserAudDirectos = uAudDir.id;
    tokenAudDirectos = securityService.generateAccessToken({
      usuarioId: uAudDir.id,
      usuario: uAudDir.usuario,
      rolId: uAudDir.rolId,
      departamentoId: uAudDir.departamentoId,
      permisos: [
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_DESCONTAR,
        PERMISOS.LISTADO_RETROCEDER,
      ],
    });

    // 7. Auditor con TODOS
    const uAudTodos = await createTestUser("t_aud_todos", rolAuditorId, null, "TODOS");
    tokenAudTodos = securityService.generateAccessToken({
      usuarioId: uAudTodos.id,
      usuario: uAudTodos.usuario,
      rolId: uAudTodos.rolId,
      departamentoId: uAudTodos.departamentoId,
      permisos: [
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_DESCONTAR,
        PERMISOS.LISTADO_RETROCEDER,
      ],
    });

    // 8. Auditor sin asignación (null)
    const uAudNull = await createTestUser("t_aud_null", rolAuditorId, null, null);
    tokenAudNullScope = securityService.generateAccessToken({
      usuarioId: uAudNull.id,
      usuario: uAudNull.usuario,
      rolId: uAudNull.rolId,
      departamentoId: uAudNull.departamentoId,
      permisos: [
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_DESCONTAR,
        PERMISOS.LISTADO_RETROCEDER,
      ],
    });

    // 9. Admin con permisos operativos base (alcance departamental)
    const uAdminOp = await createTestUser("t_admin_op", rolAdminId, null, null);
    tokenAdminSinAlcance = securityService.generateAccessToken({
      usuarioId: uAdminOp.id,
      usuario: uAdminOp.usuario,
      rolId: uAdminOp.rolId,
      departamentoId: uAdminOp.departamentoId,
      permisos: [
        PERMISOS.LISTADO_VER,
        PERMISOS.LISTADO_SEPARAR,
        PERMISOS.LISTADO_ENTREGAR,
        PERMISOS.LISTADO_DESCONTAR,
        PERMISOS.LISTADO_RETROCEDER,
      ],
    });

    // 10. Usuario con alcance de almacén DIRECTOS pero sin permiso de separar
    const uSinPerm = await createTestUser("t_sin_perm", rolAlmacenistaId, "DIRECTOS", null);
    tokenUsuarioSinPermiso = securityService.generateAccessToken({
      usuarioId: uSinPerm.id,
      usuario: uSinPerm.usuario,
      rolId: uSinPerm.rolId,
      departamentoId: uSinPerm.departamentoId,
      permisos: [PERMISOS.LISTADO_VER], // Solo ver, sin separar ni entregar
    });

    // 11. Admin con solo permiso de ver (sin permisos operativos)
    const uAdminVer = await createTestUser("t_admin_ver", rolAdminId, null, null);
    tokenAdminSoloVer = securityService.generateAccessToken({
      usuarioId: uAdminVer.id,
      usuario: uAdminVer.usuario,
      rolId: uAdminVer.rolId,
      departamentoId: uAdminVer.departamentoId,
      permisos: [PERMISOS.LISTADO_VER],
    });

    // Crear listado base para pruebas con frentes DIRECTOS e INDIRECTOS en PENDIENTE
    const listado = await prisma.listadoMaterial.create({
      data: {
        numeroListado: `TEST-DND-${Date.now()}`,
        departamentoId: deptoId,
        lineaProduccionId: lineaId,
        fechaRequerida: new Date(Date.now() + 86400000),
        estado: "PENDIENTE",
        creadoPorUsuarioId: uSA.id,
        frentes: {
          create: [
            { tipoFrente: "DIRECTOS", estado: "PENDIENTE" },
            { tipoFrente: "INDIRECTOS", estado: "PENDIENTE" },
          ],
        },
      },
    });
    listadoTestId = listado.id;

    // Crear listado dedicado para pruebas exhaustivas de retrocesos
    const listadoRet = await prisma.listadoMaterial.create({
      data: {
        numeroListado: `TEST-RET-${Date.now()}`,
        departamentoId: deptoId,
        lineaProduccionId: lineaId,
        fechaRequerida: new Date(Date.now() + 86400000),
        estado: "PENDIENTE",
        creadoPorUsuarioId: uSA.id,
        frentes: {
          create: [
            { tipoFrente: "DIRECTOS", estado: "PENDIENTE" },
            { tipoFrente: "INDIRECTOS", estado: "PENDIENTE" },
          ],
        },
      },
    });
    listadoRetrocesoId = listadoRet.id;
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    // Cleanup listados de prueba y usuarios
    const listadosParaBorrar = [listadoTestId, listadoRetrocesoId].filter(Boolean);
    for (const lid of listadosParaBorrar) {
      await prisma.historialEstadoFrente.deleteMany({
        where: { frente: { listadoMaterialId: lid } },
      });
      await prisma.listadoSurtidoFrente.deleteMany({
        where: { listadoMaterialId: lid },
      });
      await prisma.historialEstadoListado.deleteMany({
        where: { listadoMaterialId: lid },
      });
      await prisma.listadoMaterial.delete({
        where: { id: lid },
      }).catch(() => {});
    }

    if (createdUserIds.length > 0) {
      await prisma.usuarioLineaProduccion.deleteMany({
        where: { usuarioId: { in: createdUserIds } },
      });
      await prisma.usuario.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  describe("Operaciones de Almacén (Separar / Entregar)", () => {
    it("1. Almacén con asignación null: rechaza separar con 403 Forbidden (Deny-by-default)", async () => {
      const res = await requestApi("POST", `/${listadoTestId}/separar`, tokenAlmNullScope, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("No cuenta con alcance operativo de surtido de almacén");
    });

    it("2. Almacén con asignación vacía: rechaza separar con 403 Forbidden", async () => {
      const res = await requestApi("POST", `/${listadoTestId}/separar`, tokenAlmEmptyScope, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("No cuenta con alcance operativo de surtido de almacén");
    });

    it("3. Almacén con frente diferente al autorizado: rechaza con 403 Forbidden", async () => {
      // Usuario autorizado solo en DIRECTOS intenta separar INDIRECTOS
      const res = await requestApi("POST", `/${listadoTestId}/separar`, tokenAlmDirectos, {
        tipoFrente: "INDIRECTOS",
      });
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("Su alcance de almacén no le autoriza operar el frente INDIRECTOS");
    });

    it("4. Usuario con alcance DIRECTOS pero sin permiso listado:separar: rechaza con 403 Forbidden", async () => {
      const res = await requestApi("POST", `/${listadoTestId}/separar`, tokenUsuarioSinPermiso, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("Acceso denegado: se requiere el permiso");
    });

    it("5. Almacén con frente explícito autorizado (DIRECTOS): avanza exitosamente a SEPARADO", async () => {
      const res = await requestApi("POST", `/${listadoTestId}/separar`, tokenAlmDirectos, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(200);
      expect(res.json.data.frentes.find((f: any) => f.tipoFrente === "DIRECTOS").estado).toBe("SEPARADO");
    });

    it("6. Transición con estado inválido: intentar entregar un frente en PENDIENTE responde 400 Bad Request", async () => {
      // El frente INDIRECTOS sigue en PENDIENTE, no puede transicionar directo a ENTREGADO
      const res = await requestApi("POST", `/${listadoTestId}/entregar`, tokenAlmTodos, {
        tipoFrente: "INDIRECTOS",
      });
      expect(res.status).toBe(400);
      expect(res.json.message).toContain("no puede transicionar de PENDIENTE a ENTREGADO");
    });

    it("7. Almacén con TODOS: avanza exitosamente frente autorizado a ENTREGADO", async () => {
      // El frente DIRECTOS ya está en SEPARADO; usuario con TODOS lo entrega a producción
      const res = await requestApi("POST", `/${listadoTestId}/entregar`, tokenAlmTodos, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(200);
      expect(res.json.data.frentes.find((f: any) => f.tipoFrente === "DIRECTOS").estado).toBe("ENTREGADO");
    });
  });

  describe("Operaciones de Auditoría (Descontar en ERP)", () => {
    it("8. Auditoría sin asignación (null): rechaza descontar con 403 Forbidden", async () => {
      const res = await requestApi("POST", `/${listadoTestId}/descontar`, tokenAudNullScope, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("No cuenta con alcance operativo de auditoría");
    });

    it("9. Auditoría con frente no autorizado: auditor de DIRECTOS intenta descontar INDIRECTOS y es rechazado", async () => {
      const res = await requestApi("POST", `/${listadoTestId}/descontar`, tokenAudDirectos, {
        tipoFrente: "INDIRECTOS",
      });
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("Su alcance de auditoría no le autoriza descontar el frente INDIRECTOS");
    });

    it("10. Auditoría con TODOS: descuenta exitosamente frente en ENTREGADO", async () => {
      // DIRECTOS está en ENTREGADO, auditor con TODOS lo descuenta
      const res = await requestApi("POST", `/${listadoTestId}/descontar`, tokenAudTodos, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(200);
      expect(res.json.data.frentes.find((f: any) => f.tipoFrente === "DIRECTOS").estado).toBe("DESCONTADO");
    });

    it("11. Frentes descontados son irreversibles: intentar retroceder un frente DESCONTADO arroja 409 Conflict", async () => {
      const res = await requestApi("POST", `/${listadoTestId}/retroceder`, tokenAudTodos, {
        tipoFrente: "DIRECTOS",
        motivo: "Intento de reversión indebida",
      });
      expect(res.status).toBe(409);
      expect(res.json.message).toContain("está DESCONTADO y es irreversible");
    });
  });

  describe("Retrocesos y Alcances Diferenciados por Estado de Origen", () => {
    it("12. Auditor con tipoMaterialAuditor: DIRECTOS y tipoSurtidoAlmacen: null intentando SEPARADO -> PENDIENTE: debe responder 403 y NO modificar BD", async () => {
      // Ponemos frente DIRECTOS en SEPARADO con Almacenista
      await requestApi("POST", `/${listadoRetrocesoId}/separar`, tokenAlmDirectos, { tipoFrente: "DIRECTOS" });
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("SEPARADO");

      // Auditor de DIRECTOS intenta retroceder el material en preparación de almacén
      const res = await requestApi("POST", `/${listadoRetrocesoId}/retroceder`, tokenAudDirectos, {
        tipoFrente: "DIRECTOS",
        motivo: "Auditor intentando retroceder preparación interna",
      });
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("Su alcance de auditoría no le autoriza retroceder un material en preparación de almacén (SEPARADO)");

      // Verificación de estado persistido en BD: permanece intacto en SEPARADO
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("SEPARADO");
    });

    it("13. Almacenista con tipoSurtidoAlmacen: DIRECTOS y listado:retroceder: SEPARADO -> PENDIENTE se permite (200 OK) y actualiza BD", async () => {
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("SEPARADO");

      const res = await requestApi("POST", `/${listadoRetrocesoId}/retroceder`, tokenAlmDirectos, {
        tipoFrente: "DIRECTOS",
        motivo: "Almacenista revierte separación por material defectuoso",
      });
      expect(res.status).toBe(200);
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("PENDIENTE");
    });

    it("14. Auditor con alcance DIRECTOS: ENTREGADO -> PENDIENTE se permite (200 OK) y actualiza BD", async () => {
      // Almacenista avanza DIRECTOS a SEPARADO y luego a ENTREGADO
      await requestApi("POST", `/${listadoRetrocesoId}/separar`, tokenAlmDirectos, { tipoFrente: "DIRECTOS" });
      await requestApi("POST", `/${listadoRetrocesoId}/entregar`, tokenAlmDirectos, { tipoFrente: "DIRECTOS" });
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("ENTREGADO");

      // Auditor rechaza la entrega y retrocede a PENDIENTE
      const res = await requestApi("POST", `/${listadoRetrocesoId}/retroceder`, tokenAudDirectos, {
        tipoFrente: "DIRECTOS",
        motivo: "Auditor rechaza lote entregado por inconsistencias físicas",
      });
      expect(res.status).toBe(200);
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("PENDIENTE");
    });

    it("15. Auditor con alcance DIRECTOS: ENTREGADO -> SEPARADO se permite y actualiza BD", async () => {
      // Ponemos frente en ENTREGADO
      await requestApi("POST", `/${listadoRetrocesoId}/separar`, tokenAlmDirectos, { tipoFrente: "DIRECTOS" });
      await requestApi("POST", `/${listadoRetrocesoId}/entregar`, tokenAlmDirectos, { tipoFrente: "DIRECTOS" });
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("ENTREGADO");

      // Transición ENTREGADO -> SEPARADO invocada por Auditor
      const updated = await listadosLifecycleService.transicionarFrente(
        listadoRetrocesoId,
        "DIRECTOS",
        "SEPARADO",
        idUserAudDirectos,
        "Auditor regresa material entregado a estado separado",
      );
      expect(updated.frentes.find((f: any) => f.tipoFrente === "DIRECTOS")?.estado).toBe("SEPARADO");
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("SEPARADO");
    });

    it("16. Almacenista con alcance DIRECTOS: ENTREGADO -> SEPARADO y ENTREGADO -> PENDIENTE se permiten y actualizan BD", async () => {
      // 1) ENTREGADO -> SEPARADO por Almacenista
      await requestApi("POST", `/${listadoRetrocesoId}/entregar`, tokenAlmDirectos, { tipoFrente: "DIRECTOS" });
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("ENTREGADO");

      const resSep = await listadosLifecycleService.transicionarFrente(
        listadoRetrocesoId,
        "DIRECTOS",
        "SEPARADO",
        idUserAlmDirectos,
        "Almacenista corrige entrega apresurada",
      );
      expect(resSep.frentes.find((f: any) => f.tipoFrente === "DIRECTOS")?.estado).toBe("SEPARADO");
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("SEPARADO");

      // 2) ENTREGADO -> PENDIENTE por Almacenista
      await requestApi("POST", `/${listadoRetrocesoId}/entregar`, tokenAlmDirectos, { tipoFrente: "DIRECTOS" });
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("ENTREGADO");

      const resPend = await requestApi("POST", `/${listadoRetrocesoId}/retroceder`, tokenAlmDirectos, {
        tipoFrente: "DIRECTOS",
        motivo: "Almacenista anula entrega completa",
      });
      expect(resPend.status).toBe(200);
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("PENDIENTE");
    });

    it("17. Usuario sin alcance: retrocesos rechazados con 403 y NO modifican BD", async () => {
      // Preparamos frente en SEPARADO
      await requestApi("POST", `/${listadoRetrocesoId}/separar`, tokenAlmDirectos, { tipoFrente: "DIRECTOS" });
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("SEPARADO");

      const res = await requestApi("POST", `/${listadoRetrocesoId}/retroceder`, tokenAlmNullScope, {
        tipoFrente: "DIRECTOS",
        motivo: "Intento sin alcance",
      });
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("No cuenta con alcance operativo asignado para retroceder");
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("SEPARADO");
    });

    it("18. Usuario con alcance de otro frente (DIRECTOS sobre INDIRECTOS): rechaza con 403 y NO modifica BD", async () => {
      // Separamos INDIRECTOS con Almacenista TODOS
      await requestApi("POST", `/${listadoRetrocesoId}/separar`, tokenAlmTodos, { tipoFrente: "INDIRECTOS" });
      expect(await getFrenteEstado(listadoRetrocesoId, "INDIRECTOS")).toBe("SEPARADO");

      // Almacenista de DIRECTOS intenta retroceder INDIRECTOS
      const res = await requestApi("POST", `/${listadoRetrocesoId}/retroceder`, tokenAlmDirectos, {
        tipoFrente: "INDIRECTOS",
        motivo: "Intento sobre frente no autorizado",
      });
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("Su alcance de auditoría no le autoriza retroceder un material en preparación de almacén");
      expect(await getFrenteEstado(listadoRetrocesoId, "INDIRECTOS")).toBe("SEPARADO");
    });

    it("19. SUPER_ADMIN: realiza retrocesos reversibles exitosamente y actualiza BD", async () => {
      // Super Admin retrocede INDIRECTOS de SEPARADO a PENDIENTE
      expect(await getFrenteEstado(listadoRetrocesoId, "INDIRECTOS")).toBe("SEPARADO");
      const res = await requestApi("POST", `/${listadoRetrocesoId}/retroceder`, tokenSuperAdmin, {
        tipoFrente: "INDIRECTOS",
        motivo: "Super admin autoriza reversión",
      });
      expect(res.status).toBe(200);
      expect(await getFrenteEstado(listadoRetrocesoId, "INDIRECTOS")).toBe("PENDIENTE");
    });

    it("20. DESCONTADO: rechaza retroceder con 409 incluso para SUPER_ADMIN y NO modifica BD", async () => {
      // Llevamos DIRECTOS a DESCONTADO
      // DIRECTOS estaba en SEPARADO; lo entregamos y descontamos
      await requestApi("POST", `/${listadoRetrocesoId}/entregar`, tokenAlmDirectos, { tipoFrente: "DIRECTOS" });
      await requestApi("POST", `/${listadoRetrocesoId}/descontar`, tokenAudDirectos, { tipoFrente: "DIRECTOS" });
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("DESCONTADO");

      // Super Admin intenta retrocederlo
      const res = await requestApi("POST", `/${listadoRetrocesoId}/retroceder`, tokenSuperAdmin, {
        tipoFrente: "DIRECTOS",
        motivo: "Super admin intenta revertir descuento",
      });
      expect(res.status).toBe(409);
      expect(res.json.message).toContain("está DESCONTADO y es irreversible");
      expect(await getFrenteEstado(listadoRetrocesoId, "DIRECTOS")).toBe("DESCONTADO");
    });

    it("21. Transiciones inexistentes: rechaza con 400 Bad Request y NO modifica BD", async () => {
      // INDIRECTOS está en PENDIENTE; intentar saltarse directo a ENTREGADO
      expect(await getFrenteEstado(listadoRetrocesoId, "INDIRECTOS")).toBe("PENDIENTE");
      const res = await requestApi("POST", `/${listadoRetrocesoId}/entregar`, tokenSuperAdmin, {
        tipoFrente: "INDIRECTOS",
      });
      expect(res.status).toBe(400);
      expect(res.json.message).toContain("no puede transicionar de PENDIENTE a ENTREGADO");
      expect(await getFrenteEstado(listadoRetrocesoId, "INDIRECTOS")).toBe("PENDIENTE");
    });
  });

  describe("Bypass Global SUPER_ADMIN y Alcance Departamental ADMIN", () => {
    it("22. SUPER_ADMIN conserva bypass global sin requerir asignación de frentes", async () => {
      // Super Admin opera INDIRECTOS (separar) teniendo tipoSurtidoAlmacen = null
      const res = await requestApi("POST", `/${listadoTestId}/separar`, tokenSuperAdmin, {
        tipoFrente: "INDIRECTOS",
      });
      expect(res.status).toBe(200);
      expect(res.json.data.frentes.find((f: any) => f.tipoFrente === "INDIRECTOS").estado).toBe("SEPARADO");
    });

    it("23. ADMIN tiene alcance operativo departamental (entregar y descontar en su departamento sin requerir segmentación física)", async () => {
      // Admin entrega INDIRECTOS (actualmente en SEPARADO) y luego lo descuenta dentro de su departamento
      const resEntregar = await requestApi("POST", `/${listadoTestId}/entregar`, tokenAdminSinAlcance, {
        tipoFrente: "INDIRECTOS",
      });
      expect(resEntregar.status).toBe(200);
      expect(resEntregar.json.data.frentes.find((f: any) => f.tipoFrente === "INDIRECTOS").estado).toBe("ENTREGADO");

      const resDescontar = await requestApi("POST", `/${listadoTestId}/descontar`, tokenAdminSinAlcance, {
        tipoFrente: "INDIRECTOS",
      });
      expect(resDescontar.status).toBe(200);
      expect(resDescontar.json.data.frentes.find((f: any) => f.tipoFrente === "INDIRECTOS").estado).toBe("DESCONTADO");
    });

    it("23b. ADMIN de otro departamento es aislado estrictamente y no puede operar listados ajenos", async () => {
      const otroDepto = await prisma.departamento.findFirstOrThrow({
        where: { id: { not: deptoId }, estado: "ACTIVO" },
      });
      const uAdminOtroDepto = await prisma.usuario.create({
        data: {
          usuario: `t_admin_otro_${Date.now()}`,
          nombre: "Admin Otro Depto",
          passwordHash: defaultHash,
          departamentoId: otroDepto.id,
          rolId: rolAdminId,
          estado: "ACTIVO",
        },
      });
      createdUserIds.push(uAdminOtroDepto.id);

      const tokenAdminOtro = securityService.generateAccessToken({
        usuarioId: uAdminOtroDepto.id,
        usuario: uAdminOtroDepto.usuario,
        rolId: uAdminOtroDepto.rolId,
        departamentoId: uAdminOtroDepto.departamentoId,
        permisos: [
          PERMISOS.LISTADO_VER,
          PERMISOS.LISTADO_SEPARAR,
          PERMISOS.LISTADO_ENTREGAR,
          PERMISOS.LISTADO_DESCONTAR,
        ],
      });

      const res = await requestApi("POST", `/${listadoRetrocesoId}/separar`, tokenAdminOtro, {
        tipoFrente: "INDIRECTOS",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("Consulta Independiente y Operaciones en Lote", () => {
    it("24. Consulta independiente: usuario con listado:ver sin permisos operativos puede consultar listados (200 OK)", async () => {
      const res = await requestApi("GET", "", tokenAdminSoloVer);
      expect(res.status).toBe(200);
      expect(res.json.data).toBeDefined();
      expect(Array.isArray(res.json.data.items)).toBe(true);
    });

    it("25. Operaciones masivas (batch-operar): rechaza en Best-Effort con detalle en fallidos cuando un rol segmentado no tiene alcance", async () => {
      // Almacenista con permiso de entregar pero con tipoSurtidoAlmacen = null ejecuta batchOperar
      const res = await requestApi("POST", "/batch-operar", tokenAlmNullScope, {
        ids: [listadoRetrocesoId],
        accion: "separar",
        tipoFrente: "INDIRECTOS",
      });

      expect(res.status).toBe(200);
      expect(res.json.data.procesados).toBe(0);
      expect(res.json.data.fallidosCount).toBe(1);
      expect(res.json.data.fallidos[0].error).toContain("No cuenta con alcance operativo de surtido de almacén");
    });
  });
});
