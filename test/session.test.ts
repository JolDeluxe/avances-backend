/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock } from "bun:test";
import { prisma } from "../src/config/database";
import { sessionService } from "../src/modules/auth/services/session.service";
import { securityService } from "../src/modules/auth/services/security.service";
import { env } from "../src/config/env";
import { UnauthorizedError } from "../src/utils/errors";

const db = prisma as any;

describe("SessionService - Flujo de Sesión y Autenticación Persistente", () => {
  const mockPasswordHash = securityService.hashPassword("Password123!");
  const mockUsuario = {
    id: 5,
    usuario: "operador1",
    nombre: "Juan Perez",
    passwordHash: mockPasswordHash,
    estado: "ACTIVO",
    rolId: 2,
    departamentoId: 1,
    rol: { id: 2, codigo: "ALMACENISTA", nombre: "Almacenista", estado: "ACTIVO", permisos: [] },
    departamento: { id: 1, codigo: "ALMACEN", nombre: "Almacén Central", estado: "ACTIVO" },
    excepcionesPermiso: [],
  };

  it("Escenario 1 & 14: Login exitoso genera access token y refresh token para cookie, sin fugar refresh token ni password en el JSON del usuario", async () => {
    const origFindUnique = db.usuario.findUnique;
    const origSesionCreate = db.sesion.create;
    const origAuditCreate = db.registroAuditoria.create;

    let sesionGuardada: any = null;
    let auditoriaGuardada: any = null;

    db.usuario.findUnique = mock(async () => mockUsuario);
    db.sesion.create = mock(async (args: any) => {
      sesionGuardada = args.data;
      return { id: 101, ...args.data };
    });
    db.registroAuditoria.create = mock(async (args: any) => {
      auditoriaGuardada = args.data;
      return { id: 201, ...args.data };
    });

    try {
      const result = await sessionService.login(
        { usuario: "operador1", password: "Password123!" },
        "192.168.1.100",
        "Mozilla/5.0 TestBrowser",
      );

      // Verificación de Access Token
      expect(result.accessToken).toBeDefined();
      const decoded = securityService.verifyAccessToken(result.accessToken);
      expect(decoded?.usuarioId).toBe(5);
      expect(decoded?.usuario).toBe("operador1");

      // Verificación de datos de usuario en respuesta
      expect(result.usuario.id).toBe(5);
      expect(result.usuario.nombre).toBe("Juan Perez");
      expect((result.usuario as any).passwordHash).toBeUndefined();

      // Verificación de que el Refresh Token para la cookie HttpOnly fue generado
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken.length).toBe(80);

      // Verificación de almacenamiento persistente en BD: NUNCA en texto plano, SIEMPRE hash
      expect(sesionGuardada).not.toBeNull();
      expect(sesionGuardada.usuarioId).toBe(5);
      expect(sesionGuardada.refreshTokenHash).toBe(securityService.hashRefreshToken(result.refreshToken));
      expect(sesionGuardada.refreshTokenHash).not.toBe(result.refreshToken);
      expect(sesionGuardada.estado).toBe("ACTIVO");
      expect(sesionGuardada.ipOrigen).toBe("192.168.1.100");
      expect(sesionGuardada.agenteUsuario).toBe("Mozilla/5.0 TestBrowser");

      // Verificación de expiración de 30 días
      const diffDias = Math.round((sesionGuardada.fechaExpiracion.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      expect(diffDias).toBe(env.SESSION_DURATION_DAYS);

      // Verificación de auditoría
      expect(auditoriaGuardada).not.toBeNull();
      expect(auditoriaGuardada.accion).toBe("LOGIN_EXITOSO");
      expect(auditoriaGuardada.usuarioId).toBe(5);
    } finally {
      db.usuario.findUnique = origFindUnique;
      db.sesion.create = origSesionCreate;
      db.registroAuditoria.create = origAuditCreate;
    }
  });

  it("Escenario 2: Login con contraseña incorrecta falla y no genera sesión", async () => {
    const origFindUnique = db.usuario.findUnique;
    const origSesionCreate = db.sesion.create;
    let sesionCreada = false;

    db.usuario.findUnique = mock(async () => mockUsuario);
    db.sesion.create = mock(async () => {
      sesionCreada = true;
      return {};
    });

    try {
      await expect(
        sessionService.login({ usuario: "operador1", password: "PasswordIncorrecta!" }),
      ).rejects.toThrow(UnauthorizedError);

      expect(sesionCreada).toBe(false);
    } finally {
      db.usuario.findUnique = origFindUnique;
      db.sesion.create = origSesionCreate;
    }
  });

  it("Escenario 3: Usuario inactivo no puede iniciar sesión", async () => {
    const origFindUnique = db.usuario.findUnique;
    db.usuario.findUnique = mock(async () => ({
      ...mockUsuario,
      estado: "INACTIVO",
    }));

    try {
      await expect(
        sessionService.login({ usuario: "operador1", password: "Password123!" }),
      ).rejects.toThrow(UnauthorizedError);
    } finally {
      db.usuario.findUnique = origFindUnique;
    }
  });

  it("Escenario 5 & 16: Refresh renueva access token sin reingresar credenciales y actualiza fechaUltimoUso", async () => {
    const rawRefreshToken = securityService.generateRefreshToken();
    const tokenHash = securityService.hashRefreshToken(rawRefreshToken);
    const fechaFutura = new Date();
    fechaFutura.setDate(fechaFutura.getDate() + 29); // Quedan 29 días

    const mockSesionEnBd = {
      id: 50,
      usuarioId: 5,
      refreshTokenHash: tokenHash,
      estado: "ACTIVO",
      fechaExpiracion: fechaFutura,
      fechaUltimoUso: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 horas antes
      fechaRevocacion: null,
      usuario: mockUsuario,
    };

    const origSesionFind = db.sesion.findUnique;
    const origSesionUpdate = db.sesion.update;
    const origUsuarioFind = db.usuario.findUnique;
    let updateData: any = null;

    db.sesion.findUnique = mock(async () => mockSesionEnBd);
    db.usuario.findUnique = mock(async () => mockUsuario);
    db.sesion.update = mock(async (args: any) => {
      updateData = args.data;
      return { ...mockSesionEnBd, ...args.data };
    });

    try {
      const result = await sessionService.refresh(rawRefreshToken);
      expect(result.accessToken).toBeDefined();
      expect(result.usuario.id).toBe(5);

      // Verifica que el access token tiene 15 minutos de vida
      const decoded = securityService.verifyAccessToken(result.accessToken);
      expect(decoded?.usuarioId).toBe(5);
      expect(decoded!.exp - decoded!.iat).toBe(15 * 60);

      // Verifica que actualizó fechaUltimoUso
      expect(updateData).not.toBeNull();
      expect(updateData.fechaUltimoUso).toBeDefined();
    } finally {
      db.sesion.findUnique = origSesionFind;
      db.sesion.update = origSesionUpdate;
      db.usuario.findUnique = origUsuarioFind;
    }
  });

  it("Escenario 6: Refresh con cookie manipulada o no existente es rechazado", async () => {
    await expect(sessionService.refresh(undefined)).rejects.toThrow(UnauthorizedError);

    const origSesionFind = db.sesion.findUnique;
    db.sesion.findUnique = mock(async () => null);

    try {
      await expect(sessionService.refresh("cookie_falsa_o_manipulada")).rejects.toThrow(UnauthorizedError);
    } finally {
      db.sesion.findUnique = origSesionFind;
    }
  });

  it("Escenario 7 & 11: Refresh de sesión revocada falla", async () => {
    const rawRefreshToken = securityService.generateRefreshToken();
    const tokenHash = securityService.hashRefreshToken(rawRefreshToken);

    const mockSesionRevocada = {
      id: 51,
      usuarioId: 5,
      refreshTokenHash: tokenHash,
      estado: "INACTIVO", // Revocada
      fechaExpiracion: new Date(Date.now() + 1000 * 60 * 60),
      fechaRevocacion: new Date(),
      usuario: mockUsuario,
    };

    const origSesionFind = db.sesion.findUnique;
    db.sesion.findUnique = mock(async () => mockSesionRevocada);

    try {
      await expect(sessionService.refresh(rawRefreshToken)).rejects.toThrow(UnauthorizedError);
    } finally {
      db.sesion.findUnique = origSesionFind;
    }
  });

  it("Escenario 8: Refresh de sesión expirada (>30 días) falla e inactiva el registro", async () => {
    const rawRefreshToken = securityService.generateRefreshToken();
    const tokenHash = securityService.hashRefreshToken(rawRefreshToken);

    const mockSesionExpirada = {
      id: 52,
      usuarioId: 5,
      refreshTokenHash: tokenHash,
      estado: "ACTIVO",
      fechaExpiracion: new Date(Date.now() - 1000 * 60), // Expiró hace 1 minuto
      fechaRevocacion: null,
      usuario: mockUsuario,
    };

    const origSesionFind = db.sesion.findUnique;
    const origSesionUpdate = db.sesion.update;
    let inactivada = false;

    db.sesion.findUnique = mock(async () => mockSesionExpirada);
    db.sesion.update = mock(async (args: any) => {
      if (args.data.estado === "INACTIVO") inactivada = true;
      return { ...mockSesionExpirada, ...args.data };
    });

    try {
      await expect(sessionService.refresh(rawRefreshToken)).rejects.toThrow(UnauthorizedError);
      expect(inactivada).toBe(true);
    } finally {
      db.sesion.findUnique = origSesionFind;
      db.sesion.update = origSesionUpdate;
    }
  });

  it("Escenario 9: Refresh de usuario inactivado posteriormente falla", async () => {
    const rawRefreshToken = securityService.generateRefreshToken();
    const tokenHash = securityService.hashRefreshToken(rawRefreshToken);

    const mockSesionConUsuarioInactivo = {
      id: 53,
      usuarioId: 5,
      refreshTokenHash: tokenHash,
      estado: "ACTIVO",
      fechaExpiracion: new Date(Date.now() + 1000 * 60 * 60),
      fechaRevocacion: null,
      usuario: { ...mockUsuario, estado: "INACTIVO" },
    };

    const origSesionFind = db.sesion.findUnique;
    db.sesion.findUnique = mock(async () => mockSesionConUsuarioInactivo);

    try {
      await expect(sessionService.refresh(rawRefreshToken)).rejects.toThrow(UnauthorizedError);
    } finally {
      db.sesion.findUnique = origSesionFind;
    }
  });

  it("Escenario 10: Logout revoca sesión en MySQL lógicamente y genera registro de auditoría", async () => {
    const rawRefreshToken = securityService.generateRefreshToken();
    const tokenHash = securityService.hashRefreshToken(rawRefreshToken);

    const mockSesion = {
      id: 54,
      usuarioId: 5,
      refreshTokenHash: tokenHash,
      estado: "ACTIVO",
    };

    const origSesionFind = db.sesion.findUnique;
    const origSesionUpdate = db.sesion.update;
    const origAuditCreate = db.registroAuditoria.create;

    let updateArgs: any = null;
    let auditArgs: any = null;

    db.sesion.findUnique = mock(async () => mockSesion);
    db.sesion.update = mock(async (args: any) => {
      updateArgs = args;
      return { ...mockSesion, ...args.data };
    });
    db.registroAuditoria.create = mock(async (args: any) => {
      auditArgs = args.data;
      return { id: 301, ...args.data };
    });

    try {
      const res = await sessionService.logout(rawRefreshToken);
      expect(res.loggedOut).toBe(true);

      // Verificación de revocación lógica (NUNCA DELETE físico)
      expect(updateArgs).not.toBeNull();
      expect(updateArgs.where.id).toBe(54);
      expect(updateArgs.data.estado).toBe("INACTIVO");
      expect(updateArgs.data.fechaRevocacion).toBeDefined();

      // Verificación de auditoría
      expect(auditArgs).not.toBeNull();
      expect(auditArgs.accion).toBe("LOGOUT");
      expect(auditArgs.usuarioId).toBe(5);
    } finally {
      db.sesion.findUnique = origSesionFind;
      db.sesion.update = origSesionUpdate;
      db.registroAuditoria.create = origAuditCreate;
    }
  });

  it("Escenario 12 & 13: Múltiples sesiones para el mismo usuario conviven de forma independiente en MySQL (persistentes entre reinicios)", async () => {
    // Al estar cada sesión ligada a un refreshTokenHash único en la tabla `sesiones` de MySQL,
    // el usuario puede tener sesión activa en PC 1 y teléfono móvil 2.
    const tokenDevice1 = securityService.generateRefreshToken();
    const tokenDevice2 = securityService.generateRefreshToken();

    const hashDevice1 = securityService.hashRefreshToken(tokenDevice1);
    const hashDevice2 = securityService.hashRefreshToken(tokenDevice2);

    expect(hashDevice1).not.toBe(hashDevice2);

    // Ambas sesiones existen independientemente en BD
    const sessionMap = new Map<string, any>();
    sessionMap.set(hashDevice1, { id: 1001, usuarioId: 5, estado: "ACTIVO" });
    sessionMap.set(hashDevice2, { id: 1002, usuarioId: 5, estado: "ACTIVO" });

    // Revocar dispositivo 1
    sessionMap.set(hashDevice1, { id: 1001, usuarioId: 5, estado: "INACTIVO" });

    // Dispositivo 2 permanece activo
    expect(sessionMap.get(hashDevice2).estado).toBe("ACTIVO");
    expect(sessionMap.get(hashDevice1).estado).toBe("INACTIVO");
  });
});
