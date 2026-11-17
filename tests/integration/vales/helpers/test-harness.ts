import type { Server } from "node:http";
import { createApp } from "../../../../src/app";
import { prisma } from "../../../../src/config/database";
import { PERMISOS } from "../../../../src/config/permissions";
import { securityService } from "../../../../src/modules/auth/services/security.service";
import { sessionService } from "../../../../src/modules/auth/services/session.service";
import { usersService } from "../../../../src/modules/users/users.service";
import type { ValeEventoPayload } from "../../../../src/modules/vales/events";

export interface SseClientConnection {
  events: Array<{ event: string; data: ValeEventoPayload | Record<string, unknown> }>;
  closedByServer: boolean;
  waitForEvent: (
    predicate: (ev: { event: string; data: any }) => boolean,
    timeoutMs?: number,
  ) => Promise<{ event: string; data: any }>;
  close: () => void;
}

export interface ValesTestContext {
  runId: string;
  baseUrl: string;
  server: Server;
  deptoRealMPId: number;
  deptoTestMP: { id: number; codigo: string; nombre: string };
  deptoTestOtro: { id: number; codigo: string; nombre: string };
  rolMap: Record<string, number>;
  permisoMap: Record<string, number>;
  catalogs: {
    serieKABTM: { id: number; codigo: string };
    serieKAACM: { id: number; codigo: string };
    serieInactiva: { id: number; codigo: string };
    deptoBotCorte: { id: number; codigo: string; nombre: string };
    deptoCinCorte: { id: number; codigo: string; nombre: string };
    deptoCinAdorno: { id: number; codigo: string; nombre: string };
    deptoB7Corte: { id: number; codigo: string; nombre: string };
    deptoMantenimiento: { id: number; codigo: string; nombre: string };
    deptoInactivo: { id: number; codigo: string; nombre: string };
    serieOtroDepto: { id: number; codigo: string };
    deptoValeOtroDepto: { id: number; codigo: string; nombre: string };
  };
  users: {
    superAdmin: { id: number; usuario: string; token: string };
    registrador: { id: number; usuario: string; token: string };
    almVacio: { id: number; usuario: string; token: string };
    almBotaMasCinCorte: { id: number; usuario: string; token: string };
    almSoloSeparar: { id: number; usuario: string; token: string };
    almConExcepciones: { id: number; usuario: string; token: string };
    auditor: { id: number; usuario: string; token: string };
    adminMinPriv: { id: number; usuario: string; token: string };
    usuarioOtroDepto: { id: number; usuario: string; token: string };
  };
  tracked: {
    valeIds: Set<number>;
    serieIds: Set<number>;
    deptoValeIds: Set<number>;
    userIds: Set<number>;
    departamentoIds: Set<number>;
  };
  apiRequest: (
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ) => Promise<{ status: number; json: any }>;
  openSseStream: (token: string) => Promise<SseClientConnection>;
  trackVale: (id?: number) => void;
  trackSerie: (id?: number) => void;
  trackDeptoVale: (id?: number) => void;
}

/**
 * Guardia de seguridad para impedir ejecuciones accidentales contra entornos de producción.
 */
export function assertSafeTestEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BLOQUEO DE SEGURIDAD: No se permite ejecutar la suite de pruebas de integración con NODE_ENV=production",
    );
  }

  const dbHost = (process.env.DB_HOST || "").toLowerCase();
  const isLocalHost =
    dbHost === "localhost" ||
    dbHost === "127.0.0.1" ||
    dbHost === "::1" ||
    dbHost === "";

  if (!isLocalHost && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
    throw new Error(
      `BLOQUEO DE SEGURIDAD: DB_HOST ("${dbHost}") no es local. Configure ALLOW_REMOTE_TEST_DB=true solo si es una BD de pruebas aislada.`,
    );
  }
}

export async function setupValesTestContext(): Promise<ValesTestContext> {
  assertSafeTestEnvironment();

  const app = createApp();
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const runId = `${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const tracked = {
    valeIds: new Set<number>(),
    serieIds: new Set<number>(),
    deptoValeIds: new Set<number>(),
    userIds: new Set<number>(),
    departamentoIds: new Set<number>(),
  };

  // Verificar existencia de departamento real MATERIA_PRIMA (solo para lectura en T01)
  const deptoRealMP = await prisma.departamento.findUniqueOrThrow({
    where: { codigo: "MATERIA_PRIMA" },
  });

  // Crear 2 departamentos organizacionales efímeros 100% aislados para no tocar datos reales
  const deptoTestMP = await prisma.departamento.create({
    data: {
      codigo: `TST_MP_${runId}`.slice(0, 30),
      nombre: `Departamento Test Vales MP ${runId}`,
      estado: "ACTIVO",
    },
  });
  tracked.departamentoIds.add(deptoTestMP.id);

  const deptoTestOtro = await prisma.departamento.create({
    data: {
      codigo: `TST_OT_${runId}`.slice(0, 30),
      nombre: `Departamento Test Vales Otro ${runId}`,
      estado: "ACTIVO",
    },
  });
  tracked.departamentoIds.add(deptoTestOtro.id);

  const [roles, permisos] = await Promise.all([
    prisma.rol.findMany(),
    prisma.permiso.findMany(),
  ]);

  const rolMap = Object.fromEntries(roles.map((r) => [r.codigo, r.id]));
  const permisoMap = Object.fromEntries(permisos.map((p) => [p.codigo, p.id]));

  // Sembrar catálogos aislados en deptoTestMP y deptoTestOtro
  const [
    serieKABTM,
    serieKAACM,
    serieInactiva,
    deptoBotCorte,
    deptoCinCorte,
    deptoCinAdorno,
    deptoB7Corte,
    deptoMantenimiento,
    deptoInactivo,
    serieOtroDepto,
    deptoValeOtroDepto,
  ] = await Promise.all([
    prisma.serieVale.create({
      data: {
        departamentoId: deptoTestMP.id,
        codigo: "KABTM",
        esSistema: true,
        estado: "ACTIVO",
      },
    }),
    prisma.serieVale.create({
      data: {
        departamentoId: deptoTestMP.id,
        codigo: "KAACM",
        esSistema: true,
        estado: "ACTIVO",
      },
    }),
    prisma.serieVale.create({
      data: {
        departamentoId: deptoTestMP.id,
        codigo: "SRINACT",
        esSistema: false,
        estado: "INACTIVO",
      },
    }),
    prisma.departamentoVale.create({
      data: {
        departamentoId: deptoTestMP.id,
        codigo: "BOT CORTE",
        nombre: "BOT CORTE",
        areaFija: "BOTA",
        requiereSeleccionArea: false,
        esSistema: true,
        estado: "ACTIVO",
      },
    }),
    prisma.departamentoVale.create({
      data: {
        departamentoId: deptoTestMP.id,
        codigo: "CIN CORTE",
        nombre: "CIN CORTE",
        areaFija: "ACCESORIOS",
        requiereSeleccionArea: false,
        esSistema: true,
        estado: "ACTIVO",
      },
    }),
    prisma.departamentoVale.create({
      data: {
        departamentoId: deptoTestMP.id,
        codigo: "CIN ADORNO",
        nombre: "CIN ADORNO",
        areaFija: "ACCESORIOS",
        requiereSeleccionArea: false,
        esSistema: true,
        estado: "ACTIVO",
      },
    }),
    prisma.departamentoVale.create({
      data: {
        departamentoId: deptoTestMP.id,
        codigo: "B7 CORTE",
        nombre: "B7 CORTE",
        areaFija: null,
        requiereSeleccionArea: true,
        esSistema: true,
        estado: "ACTIVO",
      },
    }),
    prisma.departamentoVale.create({
      data: {
        departamentoId: deptoTestMP.id,
        codigo: "MANTENIMIENTO",
        nombre: "MANTENIMIENTO",
        areaFija: "OTRO",
        requiereSeleccionArea: false,
        esSistema: true,
        estado: "ACTIVO",
      },
    }),
    prisma.departamentoVale.create({
      data: {
        departamentoId: deptoTestMP.id,
        codigo: "DEPTO INACTIVO",
        nombre: "DEPTO INACTIVO",
        areaFija: "OTRO",
        requiereSeleccionArea: false,
        esSistema: false,
        estado: "INACTIVO",
      },
    }),
    prisma.serieVale.create({
      data: {
        departamentoId: deptoTestOtro.id,
        codigo: "KABTM",
        esSistema: true,
        estado: "ACTIVO",
      },
    }),
    prisma.departamentoVale.create({
      data: {
        departamentoId: deptoTestOtro.id,
        codigo: "BOT CORTE",
        nombre: "BOT CORTE",
        areaFija: "BOTA",
        requiereSeleccionArea: false,
        esSistema: true,
        estado: "ACTIVO",
      },
    }),
  ]);

  tracked.serieIds.add(serieKABTM.id);
  tracked.serieIds.add(serieKAACM.id);
  tracked.serieIds.add(serieInactiva.id);
  tracked.serieIds.add(serieOtroDepto.id);

  tracked.deptoValeIds.add(deptoBotCorte.id);
  tracked.deptoValeIds.add(deptoCinCorte.id);
  tracked.deptoValeIds.add(deptoCinAdorno.id);
  tracked.deptoValeIds.add(deptoB7Corte.id);
  tracked.deptoValeIds.add(deptoMantenimiento.id);
  tracked.deptoValeIds.add(deptoInactivo.id);
  tracked.deptoValeIds.add(deptoValeOtroDepto.id);

  // Crear un SUPER_ADMIN aislado de prueba (para no depender de contraseñas reales)
  const passwordHash = securityService.hashPassword("Password123");
  const passwordEncrypted = securityService.encryptPassword("Password123");

  const superAdminDb = await prisma.usuario.create({
    data: {
      usuario: `sa_${runId.toLowerCase()}`.slice(0, 30),
      nombre: "Super Admin Test Vales",
      passwordHash,
      passwordEncrypted,
      rolId: rolMap["SUPER_ADMIN"]!,
      departamentoId: deptoTestMP.id,
      estado: "ACTIVO",
    },
  });
  tracked.userIds.add(superAdminDb.id);

  const userRegistrador = await usersService.createUser(
    {
      usuario: `reg_${runId.toLowerCase()}`.slice(0, 30),
      nombre: "Registrador Test Vales",
      password: "Password123",
      rolId: rolMap["REGISTRADOR"]!,
      departamentoId: deptoTestMP.id,
    },
    superAdminDb.id,
  );
  tracked.userIds.add(userRegistrador.id);

  const userAlmVacio = await usersService.createUser(
    {
      usuario: `almv_${runId.toLowerCase()}`.slice(0, 30),
      nombre: "Almacenista Vacio Test",
      password: "Password123",
      rolId: rolMap["ALMACENISTA"]!,
      departamentoId: deptoTestMP.id,
      tipoSurtidoAlmacen: "TODOS",
    },
    superAdminDb.id,
  );
  tracked.userIds.add(userAlmVacio.id);

  const userAlmBotaMasCinCorte = await usersService.createUser(
    {
      usuario: `almm_${runId.toLowerCase()}`.slice(0, 30),
      nombre: "Almacenista Bota y Cin Corte",
      password: "Password123",
      rolId: rolMap["ALMACENISTA"]!,
      departamentoId: deptoTestMP.id,
      tipoSurtidoAlmacen: "TODOS",
      areasVale: ["BOTA"],
      departamentosValeIds: [deptoCinCorte.id],
    },
    superAdminDb.id,
  );
  tracked.userIds.add(userAlmBotaMasCinCorte.id);

  // Almacenista con VALE_SEPARAR pero con VALE_ENTREGAR denegado por excepción
  const userAlmSoloSeparar = await usersService.createUser(
    {
      usuario: `alms_${runId.toLowerCase()}`.slice(0, 30),
      nombre: "Almacenista Solo Separar",
      password: "Password123",
      rolId: rolMap["ALMACENISTA"]!,
      departamentoId: deptoTestMP.id,
      tipoSurtidoAlmacen: "TODOS",
      areasVale: ["BOTA"],
      excepciones: [
        {
          permisoId: permisoMap[PERMISOS.VALE_ENTREGAR]!,
          accion: "DENEGAR",
        },
      ],
    },
    superAdminDb.id,
  );
  tracked.userIds.add(userAlmSoloSeparar.id);

  // Almacenista autorizado solo para BOTA, pero con excepciones PERMITIR de vale:cancelar, vale:retroceder y vale:descontar
  const userAlmConExcepciones = await usersService.createUser(
    {
      usuario: `almx_${runId.toLowerCase()}`.slice(0, 30),
      nombre: "Almacenista Con Excepciones",
      password: "Password123",
      rolId: rolMap["ALMACENISTA"]!,
      departamentoId: deptoTestMP.id,
      tipoSurtidoAlmacen: "TODOS",
      areasVale: ["BOTA"],
      excepciones: [
        { permisoId: permisoMap[PERMISOS.VALE_CANCELAR]!, accion: "CONCEDER" },
        { permisoId: permisoMap[PERMISOS.VALE_RETROCEDER]!, accion: "CONCEDER" },
        { permisoId: permisoMap[PERMISOS.VALE_DESCONTAR]!, accion: "CONCEDER" },
      ],
    },
    superAdminDb.id,
  );
  tracked.userIds.add(userAlmConExcepciones.id);

  const userAuditor = await usersService.createUser(
    {
      usuario: `aud_${runId.toLowerCase()}`.slice(0, 30),
      nombre: "Auditor Test Vales",
      password: "Password123",
      rolId: rolMap["AUDITOR"]!,
      departamentoId: deptoTestMP.id,
      tipoMaterialAuditor: "TODOS",
    },
    superAdminDb.id,
  );
  tracked.userIds.add(userAuditor.id);

  const userAdminMinPriv = await usersService.createUser(
    {
      usuario: `adm_${runId.toLowerCase()}`.slice(0, 30),
      nombre: "Admin Minimo Privilegio",
      password: "Password123",
      rolId: rolMap["ADMIN"]!,
      departamentoId: deptoTestMP.id,
    },
    superAdminDb.id,
  );
  tracked.userIds.add(userAdminMinPriv.id);

  const userOtroDepto = await usersService.createUser(
    {
      usuario: `otro_${runId.toLowerCase()}`.slice(0, 30),
      nombre: "Registrador Otro Depto",
      password: "Password123",
      rolId: rolMap["REGISTRADOR"]!,
      departamentoId: deptoTestOtro.id,
    },
    superAdminDb.id,
  );
  tracked.userIds.add(userOtroDepto.id);

  // Obtener tokens JWT reales vía sessionService.login
  const [
    loginSuperAdmin,
    loginReg,
    loginAlmVacio,
    loginAlmBotaMasCinCorte,
    loginAlmSoloSeparar,
    loginAlmConExcepciones,
    loginAuditor,
    loginAdminMinPriv,
    loginOtroDepto,
  ] = await Promise.all([
    sessionService.login({ usuario: superAdminDb.usuario, password: "Password123" }),
    sessionService.login({ usuario: userRegistrador.usuario, password: "Password123" }),
    sessionService.login({ usuario: userAlmVacio.usuario, password: "Password123" }),
    sessionService.login({ usuario: userAlmBotaMasCinCorte.usuario, password: "Password123" }),
    sessionService.login({ usuario: userAlmSoloSeparar.usuario, password: "Password123" }),
    sessionService.login({ usuario: userAlmConExcepciones.usuario, password: "Password123" }),
    sessionService.login({ usuario: userAuditor.usuario, password: "Password123" }),
    sessionService.login({ usuario: userAdminMinPriv.usuario, password: "Password123" }),
    sessionService.login({ usuario: userOtroDepto.usuario, password: "Password123" }),
  ]);

  async function apiRequest(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<{ status: number; json: any }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  /**
   * Abre una conexión HTTP SSE real contra GET /api/v1/vales/stream usando fetch + ReadableStream
   * (idéntico al cliente de navegador del proyecto) y parsea los frames SSE recibidos.
   */
  async function openSseStream(token: string): Promise<SseClientConnection> {
    const abortController = new AbortController();
    const events: Array<{ event: string; data: any }> = [];
    const waiters: Array<{
      predicate: (ev: { event: string; data: any }) => boolean;
      resolve: (ev: { event: string; data: any }) => void;
    }> = [];
    let closedByServer = false;

    const response = await fetch(`${baseUrl}/vales/stream`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      signal: abortController.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`No se pudo abrir stream SSE: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    const conn: SseClientConnection = {
      events,
      get closedByServer() {
        return closedByServer;
      },
      set closedByServer(val: boolean) {
        closedByServer = val;
      },
      waitForEvent(predicate, timeoutMs = 4000) {
        const existing = events.find(predicate);
        if (existing) {
          return Promise.resolve(existing);
        }
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            const idx = waiters.findIndex((w) => w.resolve === resolveWrapper);
            if (idx >= 0) waiters.splice(idx, 1);
            reject(new Error(`Timeout (${timeoutMs}ms) esperando evento SSE`));
          }, timeoutMs);

          const resolveWrapper = (ev: { event: string; data: any }) => {
            clearTimeout(timer);
            resolve(ev);
          };

          waiters.push({ predicate, resolve: resolveWrapper });
        });
      },
      close() {
        abortController.abort();
      },
    };

    void (async () => {
      let buffer = "";
      let currentEvent = "message";
      let currentData = "";

      try {
        while (!abortController.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) {
            closedByServer = true;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              if (currentData) {
                try {
                  const parsed = JSON.parse(currentData);
                  const evObj = { event: currentEvent, data: parsed };
                  events.push(evObj);
                  for (let i = waiters.length - 1; i >= 0; i--) {
                    const w = waiters[i]!;
                    if (w.predicate(evObj)) {
                      waiters.splice(i, 1);
                      w.resolve(evObj);
                    }
                  }
                } catch {
                  // Ignorar frames no JSON
                }
                currentEvent = "message";
                currentData = "";
              }
              continue;
            }

            if (trimmed.startsWith(":")) continue;

            if (trimmed.startsWith("event:")) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith("data:")) {
              const part = trimmed.slice(5).trim();
              currentData = currentData ? `${currentData}\n${part}` : part;
            }
          }
        }
      } catch {
        // Abortado por el test al cerrar
      }
    })();

    // Esperar confirmación del evento inicial 'conectado'
    await conn.waitForEvent((ev) => ev.event === "conectado", 4000);
    return conn;
  }

  return {
    runId,
    baseUrl,
    server,
    deptoRealMPId: deptoRealMP.id,
    deptoTestMP,
    deptoTestOtro,
    rolMap,
    permisoMap,
    catalogs: {
      serieKABTM,
      serieKAACM,
      serieInactiva,
      deptoBotCorte,
      deptoCinCorte,
      deptoCinAdorno,
      deptoB7Corte,
      deptoMantenimiento,
      deptoInactivo,
      serieOtroDepto,
      deptoValeOtroDepto,
    },
    users: {
      superAdmin: {
        id: superAdminDb.id,
        usuario: superAdminDb.usuario,
        token: loginSuperAdmin.accessToken,
      },
      registrador: {
        id: userRegistrador.id,
        usuario: userRegistrador.usuario,
        token: loginReg.accessToken,
      },
      almVacio: {
        id: userAlmVacio.id,
        usuario: userAlmVacio.usuario,
        token: loginAlmVacio.accessToken,
      },
      almBotaMasCinCorte: {
        id: userAlmBotaMasCinCorte.id,
        usuario: userAlmBotaMasCinCorte.usuario,
        token: loginAlmBotaMasCinCorte.accessToken,
      },
      almSoloSeparar: {
        id: userAlmSoloSeparar.id,
        usuario: userAlmSoloSeparar.usuario,
        token: loginAlmSoloSeparar.accessToken,
      },
      almConExcepciones: {
        id: userAlmConExcepciones.id,
        usuario: userAlmConExcepciones.usuario,
        token: loginAlmConExcepciones.accessToken,
      },
      auditor: {
        id: userAuditor.id,
        usuario: userAuditor.usuario,
        token: loginAuditor.accessToken,
      },
      adminMinPriv: {
        id: userAdminMinPriv.id,
        usuario: userAdminMinPriv.usuario,
        token: loginAdminMinPriv.accessToken,
      },
      usuarioOtroDepto: {
        id: userOtroDepto.id,
        usuario: userOtroDepto.usuario,
        token: loginOtroDepto.accessToken,
      },
    },
    tracked,
    apiRequest,
    openSseStream,
    trackVale(id?: number) {
      if (id) tracked.valeIds.add(id);
    },
    trackSerie(id?: number) {
      if (id) tracked.serieIds.add(id);
    },
    trackDeptoVale(id?: number) {
      if (id) tracked.deptoValeIds.add(id);
    },
  };
}

/**
 * Limpieza estricta y segura: elimina únicamente los registros pertenecientes a los
 * departamentos efímeros de prueba y a los IDs rastreados en la sesión de test.
 */
export async function teardownValesTestContext(ctx: ValesTestContext): Promise<void> {
  assertSafeTestEnvironment();

  ctx.server.close();

  const deptoIds = Array.from(ctx.tracked.departamentoIds);
  const userIds = Array.from(ctx.tracked.userIds);

  if (deptoIds.length > 0) {
    const valesDepto = await prisma.valeMaterial.findMany({
      where: { departamentoId: { in: deptoIds } },
      select: { id: true },
    });
    for (const v of valesDepto) {
      ctx.tracked.valeIds.add(v.id);
    }
  }

  const valeIds = Array.from(ctx.tracked.valeIds);
  if (valeIds.length > 0) {
    await prisma.historialEstadoVale.deleteMany({
      where: { valeId: { in: valeIds } },
    });
    await prisma.valeMaterial.deleteMany({
      where: { id: { in: valeIds } },
    });
  }

  if (userIds.length > 0) {
    await prisma.sesion.deleteMany({
      where: { usuarioId: { in: userIds } },
    });
    await prisma.usuarioAutorizacionValeArea.deleteMany({
      where: { usuarioId: { in: userIds } },
    });
    await prisma.usuarioAutorizacionValeDepartamento.deleteMany({
      where: { usuarioId: { in: userIds } },
    });
    await prisma.usuarioLineaProduccion.deleteMany({
      where: { usuarioId: { in: userIds } },
    });
    await prisma.excepcionPermisoUsuario.deleteMany({
      where: { usuarioId: { in: userIds } },
    });
    await prisma.registroAuditoria.deleteMany({
      where: { usuarioId: { in: userIds } },
    });
  }

  if (deptoIds.length > 0) {
    await prisma.departamentoVale.deleteMany({
      where: { departamentoId: { in: deptoIds } },
    });
    await prisma.serieVale.deleteMany({
      where: { departamentoId: { in: deptoIds } },
    });
  }

  if (userIds.length > 0) {
    await prisma.usuario.deleteMany({
      where: { id: { in: userIds } },
    });
  }

  if (deptoIds.length > 0) {
    await prisma.departamento.deleteMany({
      where: { id: { in: deptoIds } },
    });
  }
}
