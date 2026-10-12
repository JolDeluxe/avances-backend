/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, mock } from "bun:test";
import { prisma } from "../src/config/database";
import { calcularPermisosEfectivos } from "../src/modules/auth/services/permission.service";

const db = prisma as any;

describe("calcularPermisosEfectivos - Reglas de Autorización", () => {
  it("debe retornar array vacío si el usuario está inactivo o no existe", async () => {
    const origFindUnique = db.usuario.findUnique;
    // Mock usuario inactivo
    db.usuario.findUnique = mock(async () => {
      return {
        id: 1,
        usuario: "inactivo1",
        estado: "INACTIVO",
        rol: { codigo: "ALMACENISTA", estado: "ACTIVO", permisos: [] },
        excepcionesPermiso: [],
      };
    });

    try {
      const permisos = await calcularPermisosEfectivos(1);
      expect(permisos).toEqual([]);
    } finally {
      db.usuario.findUnique = origFindUnique;
    }
  });

  it("debe calcular correctamente (Base ∪ CONCEDER) − DENEGAR", async () => {
    const origFindUnique = db.usuario.findUnique;
    db.usuario.findUnique = mock(async () => {
      return {
        id: 2,
        usuario: "operador2",
        estado: "ACTIVO",
        rol: {
          codigo: "ALMACENISTA",
          estado: "ACTIVO",
          permisos: [
            { estado: "ACTIVO", permiso: { codigo: "listado:ver", estado: "ACTIVO" } },
            { estado: "ACTIVO", permiso: { codigo: "listado:separar", estado: "ACTIVO" } },
            { estado: "ACTIVO", permiso: { codigo: "listado:entregar", estado: "ACTIVO" } },
            { estado: "INACTIVO", permiso: { codigo: "listado:anular", estado: "ACTIVO" } }, // Relación inactiva -> omitir
          ],
        },
        excepcionesPermiso: [
          // Conceder listado:crear
          { accion: "CONCEDER", estado: "ACTIVO", permiso: { codigo: "listado:crear", estado: "ACTIVO" } },
          // Denegar listado:entregar
          { accion: "DENEGAR", estado: "ACTIVO", permiso: { codigo: "listado:entregar", estado: "ACTIVO" } },
          // Excepción inactiva denegar listado:ver -> debe ignorarse porque está INACTIVA
          { accion: "DENEGAR", estado: "INACTIVO", permiso: { codigo: "listado:ver", estado: "ACTIVO" } },
        ],
      };
    });

    try {
      const permisos = await calcularPermisosEfectivos(2);
      // Base: [listado:ver, listado:separar, listado:entregar]
      // + Conceder: [listado:crear]
      // - Denegar: [listado:entregar]
      // Resultado esperado: [listado:ver, listado:separar, listado:crear]
      expect(permisos.sort()).toEqual(["listado:crear", "listado:separar", "listado:ver"].sort());
      expect(permisos.includes("listado:entregar")).toBe(false);
      expect(permisos.includes("listado:anular")).toBe(false);
    } finally {
      db.usuario.findUnique = origFindUnique;
    }
  });

  it("debe aplicar la regla de inmunidad de SUPER_ADMIN frente a DENEGAR", async () => {
    const origFindUnique = db.usuario.findUnique;
    const origFindMany = db.permiso.findMany;

    db.usuario.findUnique = mock(async () => {
      return {
        id: 99,
        usuario: "superadmin",
        estado: "ACTIVO",
        rol: {
          codigo: "SUPER_ADMIN",
          estado: "ACTIVO",
          permisos: [],
        },
        // Alguien intentó registrar un DENEGAR accidental al SUPER_ADMIN
        excepcionesPermiso: [
          { accion: "DENEGAR", estado: "ACTIVO", permiso: { codigo: "usuario:administrar", estado: "ACTIVO" } },
        ],
      };
    });

    db.permiso.findMany = mock(async () => {
      return [
        { codigo: "listado:crear" },
        { codigo: "listado:ver" },
        { codigo: "listado:separar" },
        { codigo: "listado:entregar" },
        { codigo: "usuario:administrar" },
        { codigo: "permiso:administrar" },
      ];
    });

    try {
      const permisos = await calcularPermisosEfectivos(99);
      // SUPER_ADMIN debe conservar TODOS los permisos activos del catálogo, ignorando cualquier DENEGAR
      expect(permisos).toContain("usuario:administrar");
      expect(permisos).toContain("permiso:administrar");
      expect(permisos.length).toBe(6);
    } finally {
      db.usuario.findUnique = origFindUnique;
      db.permiso.findMany = origFindMany;
    }
  });
});
