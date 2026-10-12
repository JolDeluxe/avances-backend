import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { prisma } from "../src/config/database";
import { securityService } from "../src/modules/auth/services/security.service";
import { permissionService } from "../src/modules/auth/services/permission.service";

describe("Validación Canónica de Segmentación Operativa y Frentes (Reglas Definitivas)", () => {
  const app = createApp();
  let server: Server | undefined;
  let port: number;

  let idDeptoMP: number;
  let idLineaBota: number;
  let idLineaBolsas: number;

  let tokenJuanDirectos: string;
  let tokenAlonsoIndirectos: string;
  let tokenPedroBolsas: string;
  let tokenAdminMP: string;

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

  function uniqueNum(pref = "SEG") {
    return `${pref}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
  }

  const TOMORROW = new Date();
  TOMORROW.setDate(TOMORROW.getDate() + 1);
  const FECHA_REQ = TOMORROW.toISOString().split("T")[0]!;

  beforeAll(async () => {
    server = app.listen(0);
    const address = server.address();
    port = typeof address === "object" && address ? address.port : 3000;

    const deptoMP = await prisma.departamento.findUniqueOrThrow({ where: { codigo: "MATERIA_PRIMA" } });
    idDeptoMP = deptoMP.id;

    const lineaBota = await prisma.lineaProduccion.findUniqueOrThrow({ where: { codigo: "BOTA" } });
    const lineaBolsas = await prisma.lineaProduccion.findUniqueOrThrow({ where: { codigo: "BOLSAS" } });
    idLineaBota = lineaBota.id;
    idLineaBolsas = lineaBolsas.id;

    // Crear/obtener usuarios de prueba para cada especialidad
    const userAdmin = await prisma.usuario.findFirstOrThrow({ where: { usuario: "admin_mp" } });
    const userJuan = await prisma.usuario.findFirstOrThrow({ where: { usuario: "almacenista_mp" } });
    const userPedro = await prisma.usuario.findFirstOrThrow({ where: { usuario: "almacenista_bolsas" } });

    // Asegurar usuario Alonso con INDIRECTOS
    let userAlonso = await prisma.usuario.findUnique({ where: { usuario: "almacenista_alonso" } });
    if (!userAlonso) {
      userAlonso = await prisma.usuario.create({
        data: {
          usuario: "almacenista_alonso",
          nombre: "Alonso Almacenista Indirectos",
          passwordHash: userJuan.passwordHash,
          rolId: userJuan.rolId,
          departamentoId: idDeptoMP,
          tipoSurtidoAlmacen: "INDIRECTOS",
          estado: "ACTIVO",
          lineasAsignadas: {
            create: [
              { lineaProduccionId: idLineaBota, estado: "ACTIVO" },
              { lineaProduccionId: idLineaBolsas, estado: "ACTIVO" },
            ],
          },
        },
      });
    }

    // Asegurar que Juan tenga asignadas BOTA y BOLSAS para probar frente
    await prisma.usuarioLineaProduccion.upsert({
      where: { usuarioId_lineaProduccionId: { usuarioId: userJuan.id, lineaProduccionId: idLineaBota } },
      update: { estado: "ACTIVO" },
      create: { usuarioId: userJuan.id, lineaProduccionId: idLineaBota, estado: "ACTIVO" },
    });
    await prisma.usuarioLineaProduccion.upsert({
      where: { usuarioId_lineaProduccionId: { usuarioId: userJuan.id, lineaProduccionId: idLineaBolsas } },
      update: { estado: "ACTIVO" },
      create: { usuarioId: userJuan.id, lineaProduccionId: idLineaBolsas, estado: "ACTIVO" },
    });

    const [permAdmin, permJuan, permAlonso, permPedro] = await Promise.all([
      permissionService.calcularPermisosEfectivos(userAdmin.id),
      permissionService.calcularPermisosEfectivos(userJuan.id),
      permissionService.calcularPermisosEfectivos(userAlonso.id),
      permissionService.calcularPermisosEfectivos(userPedro.id),
    ]);

    tokenAdminMP = securityService.generateAccessToken({
      usuarioId: userAdmin.id,
      usuario: userAdmin.usuario,
      rolId: userAdmin.rolId,
      departamentoId: userAdmin.departamentoId,
      permisos: permAdmin,
    });

    tokenJuanDirectos = securityService.generateAccessToken({
      usuarioId: userJuan.id,
      usuario: userJuan.usuario,
      rolId: userJuan.rolId,
      departamentoId: userJuan.departamentoId,
      permisos: permJuan,
    });

    tokenAlonsoIndirectos = securityService.generateAccessToken({
      usuarioId: userAlonso.id,
      usuario: userAlonso.usuario,
      rolId: userAlonso.rolId,
      departamentoId: userAlonso.departamentoId,
      permisos: permAlonso,
    });

    tokenPedroBolsas = securityService.generateAccessToken({
      usuarioId: userPedro.id,
      usuario: userPedro.usuario,
      rolId: userPedro.rolId,
      departamentoId: userPedro.departamentoId,
      permisos: permPedro,
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  });

  describe("1. Creación de frentes según la línea de producción", () => {
    it("Listado para línea BOTA crea exactamente DIRECTOS e INDIRECTOS (NO crea BOLSAS)", async () => {
      const { status, json } = await requestApi("POST", "", tokenAdminMP, {
        numeroListado: uniqueNum("BOTA-2F"),
        fechaRequerida: FECHA_REQ,
        lineaProduccionId: idLineaBota,
      });

      expect(status).toBe(201);
      expect(json.data.frentes.length).toBe(2);
      const tipos = json.data.frentes.map((f: any) => f.tipoFrente);
      expect(tipos).toContain("DIRECTOS");
      expect(tipos).toContain("INDIRECTOS");
      expect(tipos).not.toContain("BOLSAS");
      expect(json.data.estado).toBe("PENDIENTE");
    });

    it("Listado para línea BOLSAS crea exactamente DIRECTOS, INDIRECTOS y BOLSAS", async () => {
      const { status, json } = await requestApi("POST", "", tokenAdminMP, {
        numeroListado: uniqueNum("BOL-3F"),
        fechaRequerida: FECHA_REQ,
        lineaProduccionId: idLineaBolsas,
      });

      expect(status).toBe(201);
      expect(json.data.frentes.length).toBe(3);
      const tipos = json.data.frentes.map((f: any) => f.tipoFrente);
      expect(tipos).toContain("DIRECTOS");
      expect(tipos).toContain("INDIRECTOS");
      expect(tipos).toContain("BOLSAS");
      expect(json.data.estado).toBe("PENDIENTE");
    });
  });

  describe("2. Aislamiento y autorización de almacenistas por tipo de surtido", () => {
    let idListadoBota: number;
    let idListadoBolsas: number;

    beforeAll(async () => {
      const resBota = await requestApi("POST", "", tokenAdminMP, {
        numeroListado: uniqueNum("ISO-BOTA"),
        fechaRequerida: FECHA_REQ,
        lineaProduccionId: idLineaBota,
      });
      idListadoBota = resBota.json.data.id;

      const resBolsas = await requestApi("POST", "", tokenAdminMP, {
        numeroListado: uniqueNum("ISO-BOLSAS"),
        fechaRequerida: FECHA_REQ,
        lineaProduccionId: idLineaBolsas,
      });
      idListadoBolsas = resBolsas.json.data.id;
    });

    it("Juan (DIRECTOS) puede separar DIRECTOS en listado BOTA", async () => {
      const res = await requestApi("POST", `/${idListadoBota}/separar`, tokenJuanDirectos, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(200);
      expect(res.json.data.frentes.find((f: any) => f.tipoFrente === "DIRECTOS").estado).toBe("SEPARADO");
    });

    it("Juan (DIRECTOS) es rechazado (400) si intenta separar INDIRECTOS", async () => {
      const res = await requestApi("POST", `/${idListadoBota}/separar`, tokenJuanDirectos, {
        tipoFrente: "INDIRECTOS",
      });
      expect(res.status).toBe(400);
      expect(res.json.message).toContain("solo permite operar frentes de tipo DIRECTOS");
    });

    it("Alonso (INDIRECTOS) puede separar INDIRECTOS en listado BOTA", async () => {
      const res = await requestApi("POST", `/${idListadoBota}/separar`, tokenAlonsoIndirectos, {
        tipoFrente: "INDIRECTOS",
      });
      expect(res.status).toBe(200);
      expect(res.json.data.frentes.find((f: any) => f.tipoFrente === "INDIRECTOS").estado).toBe("SEPARADO");
    });

    it("Alonso (INDIRECTOS) es rechazado (400) si intenta separar DIRECTOS", async () => {
      const res = await requestApi("POST", `/${idListadoBota}/separar`, tokenAlonsoIndirectos, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(400);
      expect(res.json.message).toContain("solo permite operar frentes de tipo INDIRECTOS");
    });

    it("Pedro (BOLSAS) es rechazado (404 fuera de línea) si intenta operar listado de BOTA", async () => {
      const res = await requestApi("POST", `/${idListadoBota}/separar`, tokenPedroBolsas, {
        tipoFrente: "BOLSAS",
      });
      expect(res.status).toBe(404);
    });

    it("Pedro (BOLSAS) puede separar frente BOLSAS en listado de línea BOLSAS", async () => {
      const res = await requestApi("POST", `/${idListadoBolsas}/separar`, tokenPedroBolsas, {
        tipoFrente: "BOLSAS",
      });
      expect(res.status).toBe(200);
      expect(res.json.data.frentes.find((f: any) => f.tipoFrente === "BOLSAS").estado).toBe("SEPARADO");
    });

    it("Pedro (BOLSAS) es rechazado (400) si intenta operar DIRECTOS en línea BOLSAS", async () => {
      const res = await requestApi("POST", `/${idListadoBolsas}/separar`, tokenPedroBolsas, {
        tipoFrente: "DIRECTOS",
      });
      expect(res.status).toBe(400);
      expect(res.json.message).toContain("solo permite operar frentes de tipo BOLSAS");
    });
  });

  describe("3. Estado global compuesto y trazabilidad en HistorialEstadoFrente", () => {
    it("Calcula correctamente: PENDIENTE -> EN_PROCESO -> ENTREGADO_A_PRODUCCION", async () => {
      const { json } = await requestApi("POST", "", tokenAdminMP, {
        numeroListado: uniqueNum("COMP-FLOW"),
        fechaRequerida: FECHA_REQ,
        lineaProduccionId: idLineaBota,
      });
      const id = json.data.id;

      // 1. Estado inicial = PENDIENTE
      expect(json.data.estado).toBe("PENDIENTE");

      // 2. Separar solo DIRECTOS -> estado pasa a EN_PROCESO
      const resSepDir = await requestApi("POST", `/${id}/separar`, tokenJuanDirectos, { tipoFrente: "DIRECTOS" });
      expect(resSepDir.status).toBe(200);
      expect(resSepDir.json.data.estado).toBe("EN_PROCESO");

      // 3. Entregar DIRECTOS (INDIRECTOS aún PENDIENTE) -> listado sigue en EN_PROCESO
      const resEntDir = await requestApi("POST", `/${id}/entregar`, tokenJuanDirectos, { tipoFrente: "DIRECTOS" });
      expect(resEntDir.status).toBe(200);
      expect(resEntDir.json.data.estado).toBe("EN_PROCESO");

      // 4. Separar INDIRECTOS -> sigue en EN_PROCESO
      const resSepInd = await requestApi("POST", `/${id}/separar`, tokenAlonsoIndirectos, { tipoFrente: "INDIRECTOS" });
      expect(resSepInd.status).toBe(200);
      expect(resSepInd.json.data.estado).toBe("EN_PROCESO");

      // 5. Entregar INDIRECTOS -> ambos entregados -> pasa a ENTREGADO_A_PRODUCCION
      const resEntInd = await requestApi("POST", `/${id}/entregar`, tokenAlonsoIndirectos, { tipoFrente: "INDIRECTOS" });
      expect(resEntInd.status).toBe(200);
      expect(resEntInd.json.data.estado).toBe("ENTREGADO_A_PRODUCCION");

      // 6. Verificar historial específico por frente en HistorialEstadoFrente
      const frentesEnBD = await prisma.listadoSurtidoFrente.findMany({
        where: { listadoMaterialId: id },
        include: { historialEstados: true },
      });

      const frenteDir = frentesEnBD.find((f) => f.tipoFrente === "DIRECTOS")!;
      expect(frenteDir.historialEstados.length).toBe(2);
      expect(frenteDir.historialEstados[0]!.estadoAnterior).toBe("PENDIENTE");
      expect(frenteDir.historialEstados[0]!.estadoNuevo).toBe("SEPARADO");
      expect(frenteDir.historialEstados[1]!.estadoAnterior).toBe("SEPARADO");
      expect(frenteDir.historialEstados[1]!.estadoNuevo).toBe("ENTREGADO");

      const frenteInd = frentesEnBD.find((f) => f.tipoFrente === "INDIRECTOS")!;
      expect(frenteInd.historialEstados.length).toBe(2);
      expect(frenteInd.historialEstados[0]!.estadoAnterior).toBe("PENDIENTE");
      expect(frenteInd.historialEstados[0]!.estadoNuevo).toBe("SEPARADO");
      expect(frenteInd.historialEstados[1]!.estadoAnterior).toBe("SEPARADO");
      expect(frenteInd.historialEstados[1]!.estadoNuevo).toBe("ENTREGADO");
    });
  });
});
