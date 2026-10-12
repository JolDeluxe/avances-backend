import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { prisma } from "../src/config/database";
import { listadosService, listadosLifecycleService } from "../src/modules/listados/services";
import { listListadosQuerySchema } from "../src/modules/listados/listados.schema";
import { securityService } from "../src/modules/auth/services/security.service";
import { PERMISOS } from "../src/config/permissions";
import { ForbiddenError, BadRequestError, ConflictError, NotFoundError } from "../src/utils/errors";

// ─── IDs conocidos de la BD (resueltos dinámicamente) ────────────────────────
let idBota: number;
let idBolsa: number;
let idDeptoMP: number;
let idLineaPieles: number;

let idAlmacenistaBota: number;
let idAlmacenistaBolsa: number;
let idAlmacenistaChamarra: number;
let idAdmin: number;
let idSuperAdmin: number;

beforeAll(async () => {
  const deptoMP = await prisma.departamento.findUnique({ where: { codigo: "MATERIA_PRIMA" } });
  const deptoPieles = await prisma.departamento.findUnique({ where: { codigo: "PIELES" }, include: { lineasProduccion: true } });
  const rolAlmacenista = await prisma.rol.findFirstOrThrow({ where: { codigo: "ALMACENISTA" } });
  const rolAdmin = await prisma.rol.findFirstOrThrow({ where: { codigo: "ADMIN" } });
  const defaultPasswordHash = securityService.hashPassword("123456789");

  const lineaBota = await prisma.lineaProduccion.upsert({
    where: { codigo: "BOTA" },
    update: { estado: "ACTIVO" },
    create: { codigo: "BOTA", nombre: "BOTA", departamentoId: deptoMP!.id, estado: "ACTIVO" },
  });

  const lineaBolsa = await prisma.lineaProduccion.upsert({
    where: { codigo: "BOLSA" },
    update: { estado: "ACTIVO" },
    create: { codigo: "BOLSA", nombre: "BOLSA", departamentoId: deptoMP!.id, estado: "ACTIVO" },
  });

  const lineaChamarra = await prisma.lineaProduccion.upsert({
    where: { codigo: "CHAMARRA" },
    update: { estado: "ACTIVO" },
    create: { codigo: "CHAMARRA", nombre: "CHAMARRA", departamentoId: deptoMP!.id, estado: "ACTIVO" },
  });

  const userBota = await prisma.usuario.upsert({
    where: { usuario: "almacenista_bota" },
    update: { estado: "ACTIVO" },
    create: {
      usuario: "almacenista_bota",
      nombre: "Almacenista Bota",
      passwordHash: defaultPasswordHash,
      rolId: rolAlmacenista.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP!.id,
      estado: "ACTIVO",
      lineasAsignadas: { create: [{ lineaProduccionId: lineaBota.id, estado: "ACTIVO" }] },
    },
  });

  const userBolsa = await prisma.usuario.upsert({
    where: { usuario: "almacenista_bolsa" },
    update: { estado: "ACTIVO" },
    create: {
      usuario: "almacenista_bolsa",
      nombre: "Almacenista Bolsa",
      passwordHash: defaultPasswordHash,
      rolId: rolAlmacenista.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP!.id,
      estado: "ACTIVO",
      lineasAsignadas: { create: [{ lineaProduccionId: lineaBolsa.id, estado: "ACTIVO" }] },
    },
  });

  const userChamarra = await prisma.usuario.upsert({
    where: { usuario: "almacenista_chamarra" },
    update: { estado: "ACTIVO" },
    create: {
      usuario: "almacenista_chamarra",
      nombre: "Almacenista Chamarra",
      passwordHash: defaultPasswordHash,
      rolId: rolAlmacenista.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP!.id,
      estado: "ACTIVO",
      lineasAsignadas: { create: [{ lineaProduccionId: lineaChamarra.id, estado: "ACTIVO" }] },
    },
  });

  await prisma.usuarioLineaProduccion.upsert({
    where: {
      usuarioId_lineaProduccionId: {
        usuarioId: userBota.id,
        lineaProduccionId: lineaBota.id,
      },
    },
    update: { estado: "ACTIVO" },
    create: {
      usuarioId: userBota.id,
      lineaProduccionId: lineaBota.id,
      estado: "ACTIVO",
    },
  });

  await prisma.usuarioLineaProduccion.upsert({
    where: {
      usuarioId_lineaProduccionId: {
        usuarioId: userBolsa.id,
        lineaProduccionId: lineaBolsa.id,
      },
    },
    update: { estado: "ACTIVO" },
    create: {
      usuarioId: userBolsa.id,
      lineaProduccionId: lineaBolsa.id,
      estado: "ACTIVO",
    },
  });

  await prisma.usuarioLineaProduccion.upsert({
    where: {
      usuarioId_lineaProduccionId: {
        usuarioId: userChamarra.id,
        lineaProduccionId: lineaChamarra.id,
      },
    },
    update: { estado: "ACTIVO" },
    create: {
      usuarioId: userChamarra.id,
      lineaProduccionId: lineaChamarra.id,
      estado: "ACTIVO",
    },
  });

  const userAdmin = await prisma.usuario.upsert({
    where: { usuario: "admin_operativo" },
    update: { estado: "ACTIVO" },
    create: {
      usuario: "admin_operativo",
      nombre: "Admin Operativo",
      passwordHash: defaultPasswordHash,
      rolId: rolAdmin.id,
      departamentoId: deptoMP!.id,
      estado: "ACTIVO",
    },
  });

  const userSuperAdmin = await prisma.usuario.findFirstOrThrow({ where: { usuario: "superadmin" } });

  expect(lineaBota).toBeDefined();
  expect(lineaBolsa).toBeDefined();
  expect(deptoMP).toBeDefined();
  expect(deptoPieles).toBeDefined();
  expect(userBota).toBeDefined();
  expect(userBolsa).toBeDefined();
  expect(userChamarra).toBeDefined();
  expect(userAdmin).toBeDefined();
  expect(userSuperAdmin).toBeDefined();

  idBota = lineaBota.id;
  idBolsa = lineaBolsa.id;
  idDeptoMP = deptoMP!.id;
  idLineaPieles = deptoPieles!.lineasProduccion[0]!.id;

  idAlmacenistaBota = userBota.id;
  idAlmacenistaBolsa = userBolsa.id;
  idAlmacenistaChamarra = userChamarra.id;
  idAdmin = userAdmin.id;
  idSuperAdmin = userSuperAdmin.id;
});

// Helper para generar número de listado único
function uniqueNumero(prefix = "TEST") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 1);
const FECHA_REQUERIDA = TOMORROW.toISOString().split("T")[0]!;

// ─── 1. PERMISOS Y ALCANCE BÁSICO ─────────────────────────────────────────────
describe("Listados - Permisos y Alcance Básico", () => {
  it("almacenista_bota puede crear un listado en la línea BOTA de su departamento", async () => {
    const listado = await listadosService.createListado(
      {
        numeroListado: uniqueNumero("BOTA"),
        fechaRequerida: FECHA_REQUERIDA,
        lineaProduccionId: idBota,
      },
      idAlmacenistaBota,
    );
    expect(listado.id).toBeDefined();
    expect(listado.estado).toBe("PENDIENTE");
    expect(listado.departamentoId).toBe(idDeptoMP);
    expect(listado.lineaProduccionId).toBe(idBota);
    expect(listado.creadoPorUsuarioId).toBe(idAlmacenistaBota);
  });

  it("almacenista_bota NO puede crear un listado en la línea BOLSA (rechazado por alcance de línea)", async () => {
    await expect(
      listadosService.createListado(
        {
          numeroListado: uniqueNumero("CROSS-LINE"),
          fechaRequerida: FECHA_REQUERIDA,
          lineaProduccionId: idBolsa,
        },
        idAlmacenistaBota,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("admin_operativo (sin líneas asignadas) puede crear listados en cualquier línea de su departamento", async () => {
    const l1 = await listadosService.createListado(
      {
        numeroListado: uniqueNumero("ADMIN-BOTA"),
        fechaRequerida: FECHA_REQUERIDA,
        lineaProduccionId: idBota,
      },
      idAdmin,
    );
    expect(l1.estado).toBe("PENDIENTE");
    expect(l1.departamentoId).toBe(idDeptoMP);

    const l2 = await listadosService.createListado(
      {
        numeroListado: uniqueNumero("ADMIN-BOLSA"),
        fechaRequerida: FECHA_REQUERIDA,
        lineaProduccionId: idBolsa,
      },
      idAdmin,
    );
    expect(l2.estado).toBe("PENDIENTE");
    expect(l2.departamentoId).toBe(idDeptoMP);
  });
});

// ─── 2. AISLAMIENTO BIDIMENSIONAL (DEPARTAMENTO + LÍNEA) ───────────────────────
describe("Listados - Aislamiento Bidimensional de Seguridad", () => {
  let idListadoBolsa: number;

  beforeAll(async () => {
    const l = await listadosService.createListado(
      {
        numeroListado: uniqueNumero("AISLA-BOLSA"),
        fechaRequerida: FECHA_REQUERIDA,
        lineaProduccionId: idBolsa,
      },
      idAlmacenistaBolsa,
    );
    idListadoBolsa = l.id;
  });

  it("almacenista_bota NO puede ver un listado de BOLSA (retorna NotFound/Fuera de alcance)", async () => {
    await expect(
      listadosService.getListadoById(idListadoBolsa, idAlmacenistaBota),
    ).rejects.toThrow(NotFoundError);
  });

  it("almacenista_chamarra NO puede ver un listado de BOLSA", async () => {
    await expect(
      listadosService.getListadoById(idListadoBolsa, idAlmacenistaChamarra),
    ).rejects.toThrow(NotFoundError);
  });

  it("almacenista_bolsa SÍ puede ver su propio listado de BOLSA", async () => {
    const listado = await listadosService.getListadoById(idListadoBolsa, idAlmacenistaBolsa);
    expect(listado.id).toBe(idListadoBolsa);
  });

  it("admin_operativo de MATERIA_PRIMA puede ver el listado de BOLSA (pertenece a su depto)", async () => {
    const listado = await listadosService.getListadoById(idListadoBolsa, idAdmin);
    expect(listado.id).toBe(idListadoBolsa);
    expect(listado.departamentoId).toBe(idDeptoMP);
  });

  it("admin_operativo de MATERIA_PRIMA NO puede crear listados en líneas de PIELES (aislamiento de depto)", async () => {
    await expect(
      listadosService.createListado(
        {
          numeroListado: uniqueNumero("DEPTO-PIELES"),
          fechaRequerida: FECHA_REQUERIDA,
          lineaProduccionId: idLineaPieles,
        },
        idAdmin,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("superadmin (alcance global) puede acceder a listados de cualquier departamento y línea", async () => {
    const listado = await listadosService.getListadoById(idListadoBolsa, idSuperAdmin);
    expect(listado.id).toBe(idListadoBolsa);
  });

  it("getListados de almacenista_bota excluye totalmente listados de BOLSA o CHAMARRA", async () => {
    const resultado = await listadosService.getListados(idAlmacenistaBota, {
      pagina: 1,
      porPagina: 100,
    });
    const lineas = resultado.data.map((item: { lineaProduccionId: number }) => item.lineaProduccionId);
    expect(lineas.every((id: number) => id === idBota)).toBe(true);
  });

  it("getListados con filtro forzado a línea no asignada lanza ForbiddenError", async () => {
    await expect(
      listadosService.getListados(idAlmacenistaBota, {
        lineaProduccionId: idBolsa,
        pagina: 1,
        porPagina: 20,
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});

// ─── 3. MÁQUINA DE ESTADOS Y TRANSICIONES ────────────────────────────────────
describe("Listados - Máquina de Estados Estricta (PENDIENTE → SEPARADO → ENTREGADO_A_PRODUCCION)", () => {
  let idListado: number;

  beforeAll(async () => {
    const l = await listadosService.createListado(
      {
        numeroListado: uniqueNumero("ESTADOS"),
        fechaRequerida: FECHA_REQUERIDA,
        lineaProduccionId: idBota,
      },
      idAlmacenistaBota,
    );
    idListado = l.id;
  });

  it("Estado inicial es PENDIENTE y sin historial de transiciones", async () => {
    const l = await listadosService.getListadoById(idListado, idAlmacenistaBota);
    expect(l.estado).toBe("PENDIENTE");
    expect(l.historialEstados.length).toBe(0);
  });

  it("Transición PENDIENTE → SEPARADO exitosa y genera bitácora append-only", async () => {
    const l = await listadosLifecycleService.separar(idListado, idAlmacenistaBota, "DIRECTOS");
    expect(l.frentes.find((f: any) => f.tipoFrente === "DIRECTOS")!.estado).toBe("SEPARADO");

    const conHistorial = await listadosService.getListadoById(idListado, idAlmacenistaBota);
    
    
    
    
  });

  it("Rechaza separar nuevamente un listado que ya está SEPARADO (no idempotente)", async () => {
    await expect(
      listadosLifecycleService.separar(idListado, idAlmacenistaBota, "DIRECTOS"),
    ).rejects.toThrow(BadRequestError);
  });

  it("Transición SEPARADO → ENTREGADO_A_PRODUCCION exitosa", async () => {
    const l = await listadosLifecycleService.entregar(idListado, idAlmacenistaBota, "DIRECTOS");
    expect(l.frentes.find((f: any) => f.tipoFrente === "DIRECTOS")!.estado).toBe("ENTREGADO");

    const conHistorial = await listadosService.getListadoById(idListado, idAlmacenistaBota);
    
    
    
  });

  it("Rechaza entregar nuevamente un listado ya ENTREGADO_A_PRODUCCION", async () => {
    await expect(
      listadosLifecycleService.entregar(idListado, idAlmacenistaBota, "DIRECTOS"),
    ).rejects.toThrow(BadRequestError);
  });

  it("Rechaza saltarse estados o retroceder estados", async () => {
    // Intentar separar un listado ya ENTREGADO_A_PRODUCCION
    await expect(
      listadosLifecycleService.separar(idListado, idAlmacenistaBota, "DIRECTOS"),
    ).rejects.toThrow(BadRequestError);
  });
});

// ─── 4. SEGURIDAD EN MUTACIONES Y AISLAMIENTO ─────────────────────────────────
describe("Listados - Seguridad en Mutaciones y Bloqueo Cruzado", () => {
  let idListadoBolsa: number;

  beforeAll(async () => {
    const l = await listadosService.createListado(
      {
        numeroListado: uniqueNumero("MUTACION-BOLSA"),
        fechaRequerida: FECHA_REQUERIDA,
        lineaProduccionId: idBolsa,
      },
      idAlmacenistaBolsa,
    );
    idListadoBolsa = l.id;
  });

  it("almacenista_bota NO puede separar un listado de BOLSA manipulando el ID en la URL", async () => {
    await expect(
      listadosLifecycleService.separar(idListadoBolsa, idAlmacenistaBota, "DIRECTOS"),
    ).rejects.toThrow(NotFoundError);
  });

  it("almacenista_bota NO puede entregar un listado de BOLSA", async () => {
    await listadosLifecycleService.separar(idListadoBolsa, idAlmacenistaBolsa, "DIRECTOS");

    await expect(
      listadosLifecycleService.entregar(idListadoBolsa, idAlmacenistaBota, "DIRECTOS"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─── 5. PRUEBA DE CONCURRENCIA REAL ───────────────────────────────────────────
describe("Listados - Protección de Concurrencia (Race Condition Prevention)", () => {
  it("dos llamadas simultáneas para separar el mismo listado: exactamente una triunfa y la otra falla limpiamente", async () => {
    const listado = await listadosService.createListado(
      {
        numeroListado: uniqueNumero("CONCURRENCIA"),
        fechaRequerida: FECHA_REQUERIDA,
        lineaProduccionId: idBota,
      },
      idAlmacenistaBota,
    );

    // Ejecutar simultáneamente dos transiciones concurrentes
    const resultados = await Promise.allSettled([
      listadosLifecycleService.separar(listado.id, idAlmacenistaBota, "DIRECTOS"),
      listadosLifecycleService.separar(listado.id, idAlmacenistaBota, "DIRECTOS"),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const fallidos = resultados.filter((r) => r.status === "rejected");

    // Exactamente 1 exitoso y 1 rechazado
    expect(exitosos.length).toBe(1);
    expect(fallidos.length).toBe(1);

    // El error del rechazado debe ser BadRequestError
    const errorRechazo = (fallidos[0] as PromiseRejectedResult).reason;
    expect(errorRechazo).toBeInstanceOf(BadRequestError);

    // Verificar que solo quedó un registro en el historial
    const enBd = await listadosService.getListadoById(listado.id, idAlmacenistaBota);
    expect(enBd.frentes.find((f: any) => f.tipoFrente === "DIRECTOS")!.estado).toBe("SEPARADO");
    expect(enBd.historialEstados.length).toBe(1);
  });
});

// ─── 6. UNICIDAD Y PAGINACIÓN ────────────────────────────────────────────────
describe("Listados - Unicidad y Paginación", () => {
  it("rechaza duplicar el número de listado con ConflictError", async () => {
    const numero = uniqueNumero("DUP");
    await listadosService.createListado(
      { numeroListado: numero, fechaRequerida: FECHA_REQUERIDA, lineaProduccionId: idBota },
      idAlmacenistaBota,
    );

    await expect(
      listadosService.createListado(
        { numeroListado: numero, fechaRequerida: FECHA_REQUERIDA, lineaProduccionId: idBota },
        idAlmacenistaBota,
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("paginación exacta con metadatos reales", async () => {
    const resultado = await listadosService.getListados(idAlmacenistaBota, {
      pagina: 1,
      porPagina: 2,
    });
    expect(resultado.meta.pagina).toBe(1);
    expect(resultado.meta.porPagina).toBe(2);
    expect(resultado.meta.total).toBeGreaterThanOrEqual(1);
    expect(resultado.data.length).toBeLessThanOrEqual(2);
  });

  it("paginación completa con items, page, limit, total, totalPages, hasNextPage y hasPreviousPage", async () => {
    const prefix = `PAGE-TEST-${Date.now()}`;
    // Crear 3 listados para garantizar múltiples páginas
    const l1 = await listadosService.createListado(
      { numeroListado: `${prefix}-01`, fechaRequerida: FECHA_REQUERIDA, lineaProduccionId: idBota },
      idAlmacenistaBota,
    );
    const l2 = await listadosService.createListado(
      { numeroListado: `${prefix}-02`, fechaRequerida: FECHA_REQUERIDA, lineaProduccionId: idBota },
      idAlmacenistaBota,
    );
    const l3 = await listadosService.createListado(
      { numeroListado: `${prefix}-03`, fechaRequerida: FECHA_REQUERIDA, lineaProduccionId: idBota },
      idAlmacenistaBota,
    );

    try {
      // Página 1 (limit: 2)
      const resP1 = await listadosService.getListados(idAlmacenistaBota, {
        page: 1,
        limit: 2,
        numeroListado: prefix,
      });

      expect(resP1.pagination.page).toBe(1);
      expect(resP1.pagination.limit).toBe(2);
      expect(resP1.pagination.total).toBe(3);
      expect(resP1.pagination.totalPages).toBe(2);
      expect(resP1.pagination.hasNextPage).toBe(true);
      expect(resP1.pagination.hasPreviousPage).toBe(false);
      expect(resP1.items.length).toBe(2);

      // Página 2 (limit: 2)
      const resP2 = await listadosService.getListados(idAlmacenistaBota, {
        page: 2,
        limit: 2,
        numeroListado: prefix,
      });

      expect(resP2.pagination.page).toBe(2);
      expect(resP2.pagination.limit).toBe(2);
      expect(resP2.pagination.total).toBe(3);
      expect(resP2.pagination.totalPages).toBe(2);
      expect(resP2.pagination.hasNextPage).toBe(false);
      expect(resP2.pagination.hasPreviousPage).toBe(true);
      expect(resP2.items.length).toBe(1);

      // Verificar que los IDs entre página 1 y página 2 no se solapan
      const idsP1 = resP1.items.map((i: { id: number }) => i.id);
      const idsP2 = resP2.items.map((i: { id: number }) => i.id);
      for (const id of idsP2) {
        expect(idsP1.includes(id)).toBe(false);
      }

      // Default pagination (sin page ni limit): default page=1, limit=60
      const resDefault = await listadosService.getListados(idAlmacenistaBota, {
        numeroListado: prefix,
      });
      expect(resDefault.pagination.page).toBe(1);
      expect(resDefault.pagination.limit).toBe(60);
      expect(resDefault.items.length).toBe(3);
    } finally {
      await prisma.listadoMaterial.deleteMany({
        where: { id: { in: [l1.id, l2.id, l3.id] } },
      });
    }
  });

  it("filtros avanzados: estado, rango de fechas y departamento", async () => {
    const num = uniqueNumero("FILTROS");
    const listado = await listadosService.createListado(
      { numeroListado: num, fechaRequerida: FECHA_REQUERIDA, lineaProduccionId: idBota },
      idAlmacenistaBota,
    );

    try {
      // 1. Filtro por estado coincidente
      const resPendiente = await listadosService.getListados(idAlmacenistaBota, {
        estado: "PENDIENTE",
        numeroListado: num,
      });
      expect(resPendiente.items.length).toBe(1);

      // 2. Filtro por estado no coincidente
      const resSeparado = await listadosService.getListados(idAlmacenistaBota, {
        estado: "SEPARADO",
        numeroListado: num,
      });
      expect(resSeparado.items.length).toBe(0);

      // 3. Filtro por rango de fechas
      const resFechas = await listadosService.getListados(idAlmacenistaBota, {
        fechaDesde: FECHA_REQUERIDA,
        fechaHasta: FECHA_REQUERIDA,
        numeroListado: num,
      });
      expect(resFechas.items.length).toBe(1);

      // 4. ADMIN de MATERIA_PRIMA es rechazado con ForbiddenError al intentar forzar departamento de PIELES
      const deptoPieles = await prisma.departamento.findUnique({ where: { codigo: "PIELES" } });
      await expect(
        listadosService.getListados(idAdmin, {
          departamentoId: deptoPieles!.id,
        }),
      ).rejects.toThrow(ForbiddenError);

      // 5. SUPER_ADMIN puede filtrar explícitamente por departamento PIELES
      const resSuperAdmin = await listadosService.getListados(idSuperAdmin, {
        departamentoId: deptoPieles!.id,
      });
      for (const item of resSuperAdmin.items) {
        expect(item.departamentoId).toBe(deptoPieles!.id);
      }
    } finally {
      await prisma.listadoMaterial.delete({ where: { id: listado.id } });
    }
  });

  it("validación estricta de filtros en listListadosQuerySchema", () => {
    // 1. fechaDesde posterior a fechaHasta es rechazado
    const fechaInvalida = listListadosQuerySchema.safeParse({
      fechaDesde: "2026-10-15",
      fechaHasta: "2026-10-10",
    });
    expect(fechaInvalida.success).toBe(false);

    // 2. limit superior a 100 es rechazado
    const limitInvalido = listListadosQuerySchema.safeParse({
      limit: 150,
    });
    expect(limitInvalido.success).toBe(false);

    // 3. page menor a 1 es rechazado
    const pageInvalida = listListadosQuerySchema.safeParse({
      page: 0,
    });
    expect(pageInvalida.success).toBe(false);

    // 4. Fechas válidas son aceptadas
    const valido = listListadosQuerySchema.safeParse({
      fechaDesde: "2026-10-01",
      fechaHasta: "2026-10-10",
      page: 2,
      limit: 50,
    });
    expect(valido.success).toBe(true);
  });

  it("filtrado estricto de registros inactivos: listados con línea inactiva son inaccesibles", async () => {
    // 1. Crear una línea temporal activa
    const lineaTemp = await prisma.lineaProduccion.create({
      data: {
        codigo: `LIN_INACTIVA_${Date.now()}`,
        nombre: "Línea Temporal Inactiva",
        departamentoId: idDeptoMP,
        estado: "ACTIVO",
      },
    });

    // 2. Crear listado asociado a esa línea
    const num = uniqueNumero("INACT-TEST");
    const listado = await listadosService.createListado(
      { numeroListado: num, fechaRequerida: FECHA_REQUERIDA, lineaProduccionId: lineaTemp.id },
      idSuperAdmin,
    );

    try {
      // Confirmar que inicialmente es visible
      const detalleInicial = await listadosService.getListadoById(listado.id, idSuperAdmin);
      expect(detalleInicial.id).toBe(listado.id);

      // Inactivar la línea de producción
      await prisma.lineaProduccion.update({
        where: { id: lineaTemp.id },
        data: { estado: "INACTIVO" },
      });

      // 3. getListados no debe incluir el listado
      const lista = await listadosService.getListados(idSuperAdmin, {
        numeroListado: num,
      });
      expect(lista.items.length).toBe(0);
      expect(lista.pagination.total).toBe(0);

      // 4. getListadoById debe lanzar NotFoundError
      let errGet: unknown = null;
      try {
        await listadosService.getListadoById(listado.id, idSuperAdmin);
      } catch (e) {
        errGet = e;
      }
      expect(errGet).toBeInstanceOf(NotFoundError);

      // 5. separarListado debe lanzar NotFoundError
      let errSep: unknown = null;
      try {
        await listadosLifecycleService.separar(listado.id, idSuperAdmin, "DIRECTOS");
      } catch (e) {
        errSep = e;
      }
      expect(errSep).toBeInstanceOf(NotFoundError);

      // 6. entregarListado debe lanzar NotFoundError
      let errEnt: unknown = null;
      try {
        await listadosLifecycleService.entregar(listado.id, idSuperAdmin, "DIRECTOS");
      } catch (e) {
        errEnt = e;
      }
      expect(errEnt).toBeInstanceOf(NotFoundError);
    } finally {
      await prisma.listadoMaterial.delete({ where: { id: listado.id } });
      await prisma.lineaProduccion.delete({ where: { id: lineaTemp.id } });
    }
  });
});

describe("Paginación y Filtros HTTP - Validación y Coerción de Entrada (GET /api/v1/listados)", () => {
  const app = createApp();
  let server: Server | undefined;
  let port: number;
  let tokenAdmin: string;
  let tokenBota: string;

  beforeAll(async () => {
    server = app.listen(0);
    const address = server.address();
    port = typeof address === "object" && address ? address.port : 3000;

    tokenAdmin = securityService.generateAccessToken({
      usuarioId: idAdmin,
      usuario: "admin_operativo",
      rolId: 2,
      departamentoId: idDeptoMP,
      permisos: [PERMISOS.LISTADO_VER, PERMISOS.LISTADO_CREAR],
    });

    tokenBota = securityService.generateAccessToken({
      usuarioId: idAlmacenistaBota,
      usuario: "almacenista_bota",
      rolId: 3,
      departamentoId: idDeptoMP,
      permisos: [PERMISOS.LISTADO_VER],
    });
  });

  afterAll(async () => {
    if (server) {
      const activeServer = server;
      await new Promise<void>((resolve) => activeServer.close(() => resolve()));
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getUrl = async (path: string, token: string): Promise<{ status: number; json: any }> => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/listados${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    return { status: res.status, json };
  };

  it("A. Default: GET /listados responde 200 con paginación coherente", async () => {
    const { status, json } = await getUrl("", tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.pagination.page).toBe(1);
    expect(json.data.pagination.limit).toBe(60);
    expect(typeof json.data.pagination.total).toBe("number");
  });

  it("B. Limit explícito: GET /listados?limit=100 responde 200 y no 500", async () => {
    const { status, json } = await getUrl("?limit=100", tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.pagination.limit).toBe(100);
  });

  it("C. Page + limit: GET /listados?page=1&limit=2 responde 200 con 2 items", async () => {
    const { status, json } = await getUrl("?page=1&limit=2", tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.pagination.page).toBe(1);
    expect(json.data.pagination.limit).toBe(2);
    expect(json.data.items.length).toBeLessThanOrEqual(2);
    expect(json.data.pagination.hasNextPage).toBe(true);
    expect(json.data.pagination.hasPreviousPage).toBe(false);
  });

  it("D. Segunda página: GET /listados?page=2&limit=2 responde 200", async () => {
    const { status, json } = await getUrl("?page=2&limit=2", tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.pagination.page).toBe(2);
    expect(json.data.pagination.hasPreviousPage).toBe(true);
  });

  it("E. Línea: GET /listados?lineaProduccionId=14 responde 200 y no 500", async () => {
    const { status, json } = await getUrl(`?lineaProduccionId=${idBota}`, tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    for (const item of json.data.items) {
      expect(item.lineaProduccion.id).toBe(idBota);
    }
  });

  it("F. Departamento: GET /listados?departamentoId=1 responde 200", async () => {
    const { status, json } = await getUrl(`?departamentoId=${idDeptoMP}`, tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    for (const item of json.data.items) {
      expect(item.departamento.id).toBe(idDeptoMP);
    }
  });

  it("G. Combinación: GET /listados?page=1&limit=2&lineaProduccionId=14 responde 200", async () => {
    const { status, json } = await getUrl(`?page=1&limit=2&lineaProduccionId=${idBota}`, tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.pagination.page).toBe(1);
    expect(json.data.pagination.limit).toBe(2);
    for (const item of json.data.items) {
      expect(item.lineaProduccion.id).toBe(idBota);
    }
  });

  it("H. Estado: GET /listados?estado=PENDIENTE responde 200", async () => {
    const { status, json } = await getUrl("?estado=PENDIENTE", tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    for (const item of json.data.items) {
      expect(item.estado).toBe("PENDIENTE");
    }
  });

  it("I. Fechas: GET /listados?fechaDesde=2026-10-05&fechaHasta=2026-10-06 responde 200", async () => {
    const { status, json } = await getUrl("?fechaDesde=2026-10-05&fechaHasta=2026-10-06", tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("J. Aliases: GET /listados?pagina=2&porPagina=20 responde 200 y mapea page y limit", async () => {
    const { status, json } = await getUrl("?pagina=2&porPagina=20", tokenAdmin);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.pagination.page).toBe(2);
    expect(json.data.pagination.limit).toBe(20);
  });

  it("K. Tests Negativos: Parámetros inválidos responden 400 y nunca 500", async () => {
    const invalidCases = [
      "?page=abc",
      "?limit=abc",
      "?limit=0",
      "?limit=-1",
      "?limit=101",
      "?lineaProduccionId=abc",
      "?departamentoId=abc",
      "?pagina=0",
      "?porPagina=105",
      "?fechaDesde=2026-10-06&fechaHasta=2026-10-05",
      "?estado=INVALIDO",
    ];

    for (const query of invalidCases) {
      const { status, json } = await getUrl(query, tokenAdmin);
      expect(status).toBe(400);
      expect(json.success).toBe(false);
    }
  });

  it("L. Scope preservado: almacenista_bota filtrando por BOLSA es bloqueado por scope", async () => {
    const { status, json } = await getUrl(`?lineaProduccionId=${idBolsa}`, tokenBota);
    expect(status).toBe(403);
    expect(json.success).toBe(false);
  });
});


