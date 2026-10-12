import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { prisma } from "../src/config/database";
import { securityService } from "../src/modules/auth/services/security.service";
import { usersService } from "../src/modules/users/users.service";

describe("Verificación Funcional Obligatoria (Puntos 1 a 15)", () => {
  const app = createApp();
  let server: Server | undefined;
  let port: number;

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
      return { status: res.status, json: JSON.parse(text) };
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

    // Asegurar que usuarios base de prueba tengan la contraseña '123456789' sincronizada
    const defaultPassword = "123456789";
    const defaultPasswordHash = securityService.hashPassword(defaultPassword);
    const defaultPasswordEncrypted = securityService.encryptPassword(defaultPassword);

    await prisma.usuario.updateMany({
      where: { usuario: { in: ["admin_mp", "superadmin", "almacenista_mp", "auditor"] } },
      data: {
        passwordHash: defaultPasswordHash,
        passwordEncrypted: defaultPasswordEncrypted,
      },
    });
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  it("1. ADMIN puede iniciar sesión exitosamente", async () => {
    const res = await requestApi("POST", "/auth/login", undefined, {
      usuario: "admin_mp",
      password: "123456789",
    });

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.usuario.usuario).toBe("admin_mp");
    expect(res.json.data.usuario.rol.codigo).toBe("ADMIN");
    expect(res.json.data.accessToken).toBeDefined();
  });

  it("2, 7, 8, 9. ADMIN puede revelar contraseña de usuario permitido dentro de su departamento, coincide y queda auditada sin secretos", async () => {
    // Iniciar sesión como ADMIN MP
    const loginAdmin = await requestApi("POST", "/auth/login", undefined, {
      usuario: "admin_mp",
      password: "123456789",
    });
    const adminToken = loginAdmin.json.data.accessToken;

    // Crear usuario en departamento MATERIA_PRIMA (id: 1)
    const unique = Date.now().toString().slice(-5);
    const plainPass = `SecretUserPass_${unique}!`;
    const rolAlm = await prisma.rol.findUniqueOrThrow({ where: { codigo: "ALMACENISTA" } });
    const deptoMP = await prisma.departamento.findUniqueOrThrow({ where: { codigo: "MATERIA_PRIMA" } });

    const nuevoUser = await usersService.createUser({
      usuario: `user_test_${unique}`,
      nombre: `Usuario Test ${unique}`,
      password: plainPass,
      rolId: rolAlm.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP.id,
    });

    try {
      // Revelar contraseña
      const res = await requestApi("GET", `/users/${nuevoUser.id}/revealed-password`, adminToken);
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
      expect(res.json.data.usuario).toBe(`user_test_${unique}`);
      // Punto 9: Coincide exactamente con la contraseña de prueba
      expect(res.json.data.password).toBe(plainPass);

      // Punto 7: La revelación queda auditada
      const audit = await prisma.registroAuditoria.findFirst({
        where: {
          entidadId: nuevoUser.id,
          accion: "USUARIO_PASSWORD_REVELADO",
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.detalle?.includes("Contraseña revelada administrativamente")).toBe(true);

      // Punto 8: La contraseña NO aparece en logs/auditoría
      expect(audit?.detalle?.includes(plainPass)).toBe(false);
      expect(audit?.detalle?.includes("SecretUserPass")).toBe(false);
    } finally {
      await prisma.registroAuditoria.deleteMany({ where: { entidadId: nuevoUser.id } });
      await prisma.usuario.delete({ where: { id: nuevoUser.id } });
    }
  });

  it("3. SUPER_ADMIN puede revelar contraseña de usuario permitido", async () => {
    const loginSA = await requestApi("POST", "/auth/login", undefined, {
      usuario: "superadmin",
      password: "123456789",
    });
    const saToken = loginSA.json.data.accessToken;

    const almPieles = await prisma.usuario.findFirstOrThrow({
      where: { usuario: "almacenista_pieles" },
    });

    const res = await requestApi("GET", `/users/${almPieles.id}/revealed-password`, saToken);
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.password).toBe("123456789");
  });

  it("4. ADMIN NO puede revelar contraseña de SUPER_ADMIN (403)", async () => {
    const loginAdmin = await requestApi("POST", "/auth/login", undefined, {
      usuario: "admin_mp",
      password: "123456789",
    });
    const adminToken = loginAdmin.json.data.accessToken;

    const sa = await prisma.usuario.findFirstOrThrow({
      where: { rol: { codigo: "SUPER_ADMIN" } },
    });

    const res = await requestApi("GET", `/users/${sa.id}/revealed-password`, adminToken);
    expect(res.status).toBe(403);
    expect(res.json.message).toContain("Super Administrador");
  });

  it("5. Un usuario sin usuario:password:ver recibe 403", async () => {
    const loginAlm = await requestApi("POST", "/auth/login", undefined, {
      usuario: "almacenista_mp",
      password: "123456789",
    });
    const almToken = loginAlm.json.data.accessToken;

    const targetUser = await prisma.usuario.findFirstOrThrow({
      where: { usuario: "admin_mp" },
    });

    const res = await requestApi("GET", `/users/${targetUser.id}/revealed-password`, almToken);
    expect(res.status).toBe(403);
  });

  it("6. Un ADMIN fuera del alcance recibe 404", async () => {
    const loginAdmin = await requestApi("POST", "/auth/login", undefined, {
      usuario: "admin_mp",
      password: "123456789",
    });
    const adminToken = loginAdmin.json.data.accessToken;

    const userPieles = await prisma.usuario.findFirstOrThrow({
      where: { usuario: "almacenista_pieles" },
    });

    const res = await requestApi("GET", `/users/${userPieles.id}/revealed-password`, adminToken);
    expect(res.status).toBe(404);
  });

  it("10. El login sigue funcionando con passwordHash", async () => {
    const res = await requestApi("POST", "/auth/login", undefined, {
      usuario: "auditor",
      password: "123456789",
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.usuario.usuario).toBe("auditor");
  });

  it("11, 12, 13. Cambio/reset de contraseña actualiza passwordHash y passwordEncrypted, clave vieja deja de funcionar y sesiones se invalidan", async () => {
    const unique = Date.now().toString().slice(-5);
    const initialPass = "ClaveInicial_123!";
    const changedPass = "ClaveCambiada_456!";

    const rolAlm = await prisma.rol.findUniqueOrThrow({ where: { codigo: "ALMACENISTA" } });
    const deptoMP = await prisma.departamento.findUniqueOrThrow({ where: { codigo: "MATERIA_PRIMA" } });

    const user = await usersService.createUser({
      usuario: `u_chg_${unique}`,
      nombre: `Usuario Cambio ${unique}`,
      password: initialPass,
      rolId: rolAlm.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP.id,
    });

    try {
      // Iniciar sesión con clave inicial
      const loginInitial = await requestApi("POST", "/auth/login", undefined, {
        usuario: user.usuario,
        password: initialPass,
      });
      expect(loginInitial.status).toBe(200);
      const userToken = loginInitial.json.data.accessToken;

      // Cambiar contraseña vía autoservicio
      const resChange = await requestApi("POST", "/auth/change-password", userToken, {
        currentPassword: initialPass,
        newPassword: changedPass,
      });
      expect(resChange.status).toBe(200);

      // Punto 11: Verificar que AMBAS representaciones en BD fueron actualizadas
      const enBd = await prisma.usuario.findUniqueOrThrow({ where: { id: user.id } });
      expect(securityService.verifyPassword(changedPass, enBd.passwordHash)).toBe(true);
      expect(securityService.decryptPassword(enBd.passwordEncrypted!)).toBe(changedPass);

      // Punto 12: Clave vieja ya no funciona para login
      const loginOld = await requestApi("POST", "/auth/login", undefined, {
        usuario: user.usuario,
        password: initialPass,
      });
      expect(loginOld.status).toBe(401);

      // Clave nueva sí funciona para login
      const loginNew = await requestApi("POST", "/auth/login", undefined, {
        usuario: user.usuario,
        password: changedPass,
      });
      expect(loginNew.status).toBe(200);

      // Punto 13: Las sesiones previas quedaron revocadas
      const sesiones = await prisma.sesion.findMany({ where: { usuarioId: user.id } });
      const sesionesInactivas = sesiones.filter((s) => s.estado === "INACTIVO");
      expect(sesionesInactivas.length).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.sesion.deleteMany({ where: { usuarioId: user.id } });
      await prisma.registroAuditoria.deleteMany({ where: { entidadId: user.id } });
      await prisma.usuario.delete({ where: { id: user.id } });
    }
  });

  it("14. versionPermisos funciona de extremo a extremo (rechazo 401 PERMISOS_OBSOLETOS)", async () => {
    const unique = Date.now().toString().slice(-5);
    const rolAlm = await prisma.rol.findUniqueOrThrow({ where: { codigo: "ALMACENISTA" } });
    const deptoMP = await prisma.departamento.findUniqueOrThrow({ where: { codigo: "MATERIA_PRIMA" } });

    const u = await usersService.createUser({
      usuario: `u_vperm_${unique}`,
      nombre: `User VPerm ${unique}`,
      password: "Password123!",
      rolId: rolAlm.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP.id,
    });

    try {
      // Login para obtener token con versionPermisos actual (1)
      const login = await requestApi("POST", "/auth/login", undefined, {
        usuario: u.usuario,
        password: "Password123!",
      });
      expect(login.status).toBe(200);
      const tokenV1 = login.json.data.accessToken;

      // El token es válido
      const check1 = await requestApi("GET", "/auth/me", tokenV1);
      expect(check1.status).toBe(200);

      // Se actualizan permisos (incrementa versionPermisos a 2 en BD)
      const sa = await prisma.usuario.findFirstOrThrow({ where: { rol: { codigo: "SUPER_ADMIN" } } });
      const permVer = await prisma.permiso.findUniqueOrThrow({ where: { codigo: "listado:ver" } });
      await usersService.updateUser(
        u.id,
        { excepciones: [{ permisoId: permVer.id, accion: "CONCEDER" }] },
        sa.id,
      );

      // Token v1 es rechazado inmediatamente con 401 "PERMISOS_OBSOLETOS"
      const check2 = await requestApi("GET", "/auth/me", tokenV1);
      expect(check2.status).toBe(401);
      expect(check2.json.message).toBe("PERMISOS_OBSOLETOS");
    } finally {
      await prisma.excepcionPermisoUsuario.deleteMany({ where: { usuarioId: u.id } });
      await prisma.sesion.deleteMany({ where: { usuarioId: u.id } });
      await prisma.usuario.delete({ where: { id: u.id } });
    }
  });

  it("15. /api/v1/listados/:id/descontar continúa SIN estar expuesto en HTTP durante Fase 1 (404)", async () => {
    const loginSA = await requestApi("POST", "/auth/login", undefined, {
      usuario: "superadmin",
      password: "123456789",
    });
    const saToken = loginSA.json.data.accessToken;

    const res = await requestApi("POST", "/listados/1/descontar", saToken, { motivo: "Test" });
    expect(res.status).toBe(404);
  });
});
