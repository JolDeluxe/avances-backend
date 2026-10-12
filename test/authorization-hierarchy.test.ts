import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { usersService } from "../src/modules/users/users.service";
import { prisma } from "../src/config/database";
import { securityService } from "../src/modules/auth/services/security.service";

describe("Parte 2: Jerarquía Administrativa, Excepciones, Versión de Permisos y Revelación de Contraseñas", () => {
  const app = createApp();
  let server: Server | undefined;
  let port: number;

  let superAdminToken: string;
  let adminMPToken: string;
  let almacenistaMPToken: string;
  let superAdminUser: { id: number; usuario: string };
  let adminMPUser: { id: number; usuario: string; departamentoId: number | null };
  let rolSuperAdminId: number;
  let rolAlmacenistaId: number;
  let deptoMPId: number;
  let deptoPielesId: number;

  type ApiResponse = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    message?: string;
    success?: boolean;
    [key: string]: unknown;
  };

  const requestApi = async (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
  ): Promise<{ status: number; json: ApiResponse }> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as ApiResponse;
      return { status: res.status, json: parsed };
    } catch {
      return { status: res.status, json: { raw: text } };
    }
  };

  beforeAll(async () => {
    server = app.listen(0);
    const addr = server.address();
    if (typeof addr === "object" && addr) {
      port = addr.port;
    } else {
      throw new Error("No se pudo iniciar el servidor de pruebas");
    }

    // Roles
    const rSA = await prisma.rol.findUniqueOrThrow({ where: { codigo: "SUPER_ADMIN" } });
    const rAlm = await prisma.rol.findUniqueOrThrow({ where: { codigo: "ALMACENISTA" } });
    rolSuperAdminId = rSA.id;
    rolAlmacenistaId = rAlm.id;

    // Deptos
    const dMP = await prisma.departamento.findUniqueOrThrow({ where: { codigo: "MATERIA_PRIMA" } });
    const dPieles = await prisma.departamento.findUniqueOrThrow({ where: { codigo: "PIELES" } });
    deptoMPId = dMP.id;
    deptoPielesId = dPieles.id;

    // Obtener usuarios base
    const sa = await prisma.usuario.findFirstOrThrow({
      where: { rol: { codigo: "SUPER_ADMIN" }, estado: "ACTIVO" },
    });
    superAdminUser = sa;

    const adm = await prisma.usuario.findFirstOrThrow({
      where: { rol: { codigo: "ADMIN" }, departamentoId: deptoMPId, estado: "ACTIVO" },
    });
    adminMPUser = adm;

    const alm = await prisma.usuario.findFirstOrThrow({
      where: { rol: { codigo: "ALMACENISTA" }, departamentoId: deptoMPId, estado: "ACTIVO" },
    });

    // Generar tokens válidos
    const saPerms = await prisma.permiso.findMany({ select: { codigo: true } });
    superAdminToken = securityService.generateAccessToken({
      usuarioId: sa.id,
      usuario: sa.usuario,
      rolId: sa.rolId,
      departamentoId: sa.departamentoId,
      permisos: saPerms.map((p) => p.codigo),
      versionPermisos: sa.versionPermisos,
    });

    const admPerms = await prisma.rolPermiso.findMany({
      where: { rolId: adm.rolId },
      include: { permiso: true },
    });
    adminMPToken = securityService.generateAccessToken({
      usuarioId: adm.id,
      usuario: adm.usuario,
      rolId: adm.rolId,
      departamentoId: adm.departamentoId,
      permisos: admPerms.map((rp) => rp.permiso.codigo),
      versionPermisos: adm.versionPermisos,
    });

    const almPerms = await prisma.rolPermiso.findMany({
      where: { rolId: alm.rolId },
      include: { permiso: true },
    });
    almacenistaMPToken = securityService.generateAccessToken({
      usuarioId: alm.id,
      usuario: alm.usuario,
      rolId: alm.rolId,
      departamentoId: alm.departamentoId,
      permisos: almPerms.map((rp) => rp.permiso.codigo),
      versionPermisos: alm.versionPermisos,
    });
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe("1. Blindaje Jerárquico de ADMIN", () => {
    it("ADMIN no puede crear un usuario con rol SUPER_ADMIN (403)", async () => {
      const res = await requestApi("POST", "/users", adminMPToken, {
        usuario: `fake_sa_${Date.now()}`,
        nombre: "Fake Super Admin",
        password: "Password123!",
        rolId: rolSuperAdminId,
        departamentoId: deptoMPId,
      });

      expect(res.status).toBe(403);
      expect(res.json.message).toContain("SUPER_ADMIN");
    });

    it("ADMIN no puede modificar ni promover a otro usuario a SUPER_ADMIN (403)", async () => {
      const res = await requestApi("PUT", `/users/${superAdminUser.id}`, adminMPToken, {
        nombre: "Nombre Modificado Por Admin",
      });

      expect(res.status).toBe(403);
      expect(res.json.message).toContain("SUPER_ADMIN");
    });

    it("ADMIN no puede desactivar a un usuario SUPER_ADMIN (403)", async () => {
      const res = await requestApi("DELETE", `/users/${superAdminUser.id}`, adminMPToken);

      expect(res.status).toBe(403);
      expect(res.json.message).toContain("SUPER_ADMIN");
    });

    it("ADMIN no puede operar ni ver recursos de otro departamento (Aislamiento de Scope)", async () => {
      const res = await requestApi("POST", "/users", adminMPToken, {
        usuario: `user_diff_dep_${Date.now()}`,
        nombre: "Usuario Otro Depto",
        password: "Password123!",
        rolId: rolAlmacenistaId, tipoSurtidoAlmacen: 'DIRECTOS',
        departamentoId: deptoPielesId,
      });

      expect(res.status).toBe(403);
    });

    it("ADMIN no puede modificar la matriz global de permisos de roles (403)", async () => {
      const res = await requestApi("PUT", `/roles/${rolAlmacenistaId}/permisos`, adminMPToken, {
        permisosIds: [1, 2],
      });

      expect(res.status).toBe(403);
    });
  });

  describe("2. Reglas Estrictas de Excepciones de Permisos", () => {
    it("Rechaza excepciones negativas (DENEGAR no permitido) en validación de schema (400)", async () => {
      const res = await requestApi("POST", "/users", superAdminToken, {
        usuario: `exc_neg_${Date.now()}`,
        nombre: "Test Negativo",
        password: "Password123!",
        rolId: rolAlmacenistaId, tipoSurtidoAlmacen: 'DIRECTOS',
        departamentoId: deptoMPId,
        excepciones: [
          {
            permisoId: 1,
            accion: "DENEGAR",
          },
        ],
      });

      expect(res.status).toBe(400);
    });

    it("ADMIN no puede otorgar excepciones de permisos de sistema reservados (403)", async () => {
      const permisoAdmin = await prisma.permiso.findUniqueOrThrow({
        where: { codigo: "permiso:administrar" },
      });

      const res = await requestApi("POST", "/users", adminMPToken, {
        usuario: `exc_sys_${Date.now()}`,
        nombre: "Test Excepcion Sistema",
        password: "Password123!",
        rolId: rolAlmacenistaId, tipoSurtidoAlmacen: 'DIRECTOS',
        departamentoId: deptoMPId,
        excepciones: [
          {
            permisoId: permisoAdmin.id,
            accion: "CONCEDER",
          },
        ],
      });

      expect(res.status).toBe(403);
      expect(res.json.message).toContain("está reservado a SUPER_ADMIN");
    });

    it("ADMIN no puede otorgar permisos que él mismo no posea (403)", async () => {
      const permisoNoPropio = await prisma.permiso.findFirstOrThrow({
        where: {
          codigo: "listado:descontar",
        },
      });

      const res = await requestApi("POST", "/users", adminMPToken, {
        usuario: `exc_no_own_${Date.now()}`,
        nombre: "Test No Propio",
        password: "Password123!",
        rolId: rolAlmacenistaId, tipoSurtidoAlmacen: 'DIRECTOS',
        departamentoId: deptoMPId,
        excepciones: [
          {
            permisoId: permisoNoPropio.id,
            accion: "CONCEDER",
          },
        ],
      });

      expect(res.status).toBe(403);
      expect(res.json.message).toContain("porque usted no lo posee");
    });
  });

  describe("3. Renovación Inmediata de Permisos (versionPermisos)", () => {
    it("Token con versionPermisos anterior es rechazado con 401 'PERMISOS_OBSOLETOS' tras actualización", async () => {
      const unique = Date.now().toString().slice(-5);
      const testUser = await usersService.createUser({
        usuario: `ver_perm_${unique}`,
        nombre: `Test Version ${unique}`,
        password: "Password123!",
        rolId: rolAlmacenistaId, tipoSurtidoAlmacen: 'DIRECTOS',
        departamentoId: deptoMPId,
      });

      // Crear token con versionPermisos = 1
      const tokenV1 = securityService.generateAccessToken({
        usuarioId: testUser.id,
        usuario: testUser.usuario,
        rolId: testUser.rol.id,
        departamentoId: testUser.departamento.id,
        permisos: ["listado:ver"],
        versionPermisos: 1,
      });

      // Petición con tokenV1 es válida consultando el endpoint canónico de identidad /auth/me
      const resValida = await requestApi("GET", "/auth/me", tokenV1);
      expect(resValida.status).toBe(200);

      // SuperAdmin actualiza el usuario otorgando una excepción, lo que incrementa versionPermisos
      const permisoVer = await prisma.permiso.findUniqueOrThrow({ where: { codigo: "listado:ver" } });
      await usersService.updateUser(
        testUser.id,
        {
          excepciones: [{ permisoId: permisoVer.id, accion: "CONCEDER" }],
        },
        superAdminUser.id,
      );

      // Comprobar que en BD versionPermisos subió a 2
      const uUpdated = await prisma.usuario.findUniqueOrThrow({ where: { id: testUser.id } });
      expect(uUpdated.versionPermisos).toBe(2);

      // Petición con el token anterior (V1) ahora debe responder 401 con código "PERMISOS_OBSOLETOS"
      const resInvalida = await requestApi("GET", "/auth/me", tokenV1);
      expect(resInvalida.status).toBe(401);
      expect(resInvalida.json.message).toBe("PERMISOS_OBSOLETOS");

      // Limpieza
      await prisma.excepcionPermisoUsuario.deleteMany({ where: { usuarioId: testUser.id } });
      await prisma.sesion.deleteMany({ where: { usuarioId: testUser.id } });
      await prisma.usuario.delete({ where: { id: testUser.id } });
    });
  });

  describe("4. Capacidad Administrativa de Revelación de Contraseña (GET /users/:id/revealed-password)", () => {
    it("ADMIN puede revelar la contraseña de un usuario dentro de su departamento y queda auditado", async () => {
      const unique = Date.now().toString().slice(-5);
      const plainPass = `SecretPassword_${unique}!`;

      const nuevoUsuario = await usersService.createUser({
        usuario: `rev_user_${unique}`,
        nombre: `Usuario Revelable ${unique}`,
        password: plainPass,
        rolId: rolAlmacenistaId, tipoSurtidoAlmacen: 'DIRECTOS',
        departamentoId: deptoMPId,
      });

      try {
        const res = await requestApi("GET", `/users/${nuevoUsuario.id}/revealed-password`, adminMPToken);
        expect(res.status).toBe(200);
        expect(res.json.success).toBe(true);
        expect(res.json.data.usuario).toBe(`rev_user_${unique}`);
        expect(res.json.data.password).toBe(plainPass);

        // Verificar que la auditoría transversal se generó
        const audit = await prisma.registroAuditoria.findFirst({
          where: {
            entidadId: nuevoUsuario.id,
            accion: "USUARIO_PASSWORD_REVELADO",
          },
        });
        expect(audit).toBeDefined();
        expect(audit?.detalle?.includes("Contraseña revelada administrativamente")).toBe(true);
        // NUNCA debe contener la contraseña ni el cifrado en la auditoría
        expect(audit?.detalle?.includes(plainPass)).toBe(false);
      } finally {
        await prisma.registroAuditoria.deleteMany({ where: { entidadId: nuevoUsuario.id } });
        await prisma.usuario.delete({ where: { id: nuevoUsuario.id } });
      }
    });

    it("ADMIN NO puede revelar la contraseña de un SUPER_ADMIN (403)", async () => {
      const res = await requestApi("GET", `/users/${superAdminUser.id}/revealed-password`, adminMPToken);
      expect(res.status).toBe(403);
      expect(res.json.message).toContain("Super Administrador");
    });

    it("SUPER_ADMIN NO puede revelar la contraseña de otro SUPER_ADMIN (403)", async () => {
      const unique = Date.now().toString().slice(-5);
      const segundoSA = await usersService.createUser({
        usuario: `sa2_${unique}`,
        nombre: `Segundo SA ${unique}`,
        password: "PassSuperAdmin2!",
        rolId: rolSuperAdminId,
        departamentoId: deptoMPId,
      }, superAdminUser.id);

      try {
        const res = await requestApi("GET", `/users/${segundoSA.id}/revealed-password`, superAdminToken);
        expect(res.status).toBe(403);
        expect(res.json.message).toContain("Super Administrador");
      } finally {
        await prisma.usuario.delete({ where: { id: segundoSA.id } });
      }
    });

    it("ADMIN NO puede revelar la contraseña de un usuario de otro departamento (404 fuera de alcance)", async () => {
      const userPieles = await prisma.usuario.findFirstOrThrow({
        where: { departamentoId: deptoPielesId, estado: "ACTIVO" },
      });

      const res = await requestApi("GET", `/users/${userPieles.id}/revealed-password`, adminMPToken);
      expect(res.status).toBe(404);
    });

    it("Usuario sin permiso usuario:password:ver recibe 403 Forbidden", async () => {
      const res = await requestApi("GET", `/users/${adminMPUser.id}/revealed-password`, almacenistaMPToken);
      expect(res.status).toBe(403);
    });
  });

  describe("5. Fase 1: Ruta HTTP /api/v1/listados/:id/descontar desactivada", () => {
    it("Retorna 404 para cualquier llamada a /descontar por HTTP", async () => {
      const resSA = await requestApi("POST", "/listados/999/descontar", superAdminToken, {});
      expect(resSA.status).toBe(404);

      const resAdm = await requestApi("POST", "/listados/999/descontar", adminMPToken, {});
      expect(resAdm.status).toBe(404);
    });
  });
});
