import { prisma } from "../../../config/database";
import { UnauthorizedError } from "../../../utils/errors";
import { env } from "../../../config/env";
import { securityService } from "./security.service";
import { permissionService } from "./permission.service";
import type { LoginInput } from "../auth.schema";

export interface LoginResult {
  usuario: {
    id: number;
    usuario: string;
    nombre: string;
    rol: {
      id: number;
      codigo: string;
      nombre: string;
    };
    departamento: {
      id: number;
      codigo: string;
      nombre: string;
    };
    tipoSurtidoAlmacen?: string | null;
    tipoMaterialAuditor?: string | null;
    lineasAsignadas?: { id: number; codigo: string; nombre: string; area?: string }[];
    permisos: string[];
  };
  accessToken: string;
  refreshToken: string; // Para enviar exclusivamente en Cookie HttpOnly
}

export interface RefreshResult {
  usuario: {
    id: number;
    usuario: string;
    nombre: string;
    rol?: {
      id: number;
      codigo: string;
      nombre: string;
    };
    departamento?: {
      id: number;
      codigo: string;
      nombre: string;
    };
    tipoSurtidoAlmacen?: string | null;
    tipoMaterialAuditor?: string | null;
    lineasAsignadas?: { id: number; codigo: string; nombre: string; area?: string }[];
    permisos: string[];
  };
  accessToken: string;
}

export class SessionService {
  /**
   * Inicia sesión validando credenciales y creando una Sesion persistente de 30 días en MySQL
   */
  async login(input: LoginInput, ipOrigen?: string, agenteUsuario?: string): Promise<LoginResult> {
    const usuario = await prisma.usuario.findFirst({
      where: {
        OR: [
          { usuario: input.usuario },
          { nombre: input.usuario },
        ],
        estado: "ACTIVO",
      },
      include: {
        rol: true,
        departamento: true,
        lineasAsignadas: {
          where: { estado: "ACTIVO" },
          include: {
            lineaProduccion: {
              select: { id: true, codigo: true, nombre: true, area: true },
            },
          },
        },
      },
    });

    if (!usuario || usuario.estado !== "ACTIVO") {
      // Registrar intento fallido en RegistroAuditoria si correspondiera
      throw new UnauthorizedError("Credenciales inválidas o usuario inactivo");
    }

    const isValidPassword = securityService.verifyPassword(input.password, usuario.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError("Credenciales inválidas o usuario inactivo");
    }

    // Calcular permisos efectivos para incluir en el payload del token y respuesta
    const permisos = await permissionService.calcularPermisosEfectivos(usuario.id);

    // Generar Refresh Token y su Hash para almacenamiento seguro
    const refreshToken = securityService.generateRefreshToken();
    const refreshTokenHash = securityService.hashRefreshToken(refreshToken);

    // Calcular fecha de expiración de 30 días
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(fechaExpiracion.getDate() + env.SESSION_DURATION_DAYS);

    // Crear sesión persistente en MySQL
    await prisma.sesion.create({
      data: {
        usuarioId: usuario.id,
        refreshTokenHash,
        estado: "ACTIVO",
        fechaExpiracion,
        fechaUltimoUso: new Date(),
        ipOrigen: ipOrigen?.slice(0, 45),
        agenteUsuario: agenteUsuario?.slice(0, 255),
      },
    });

    // Registrar en RegistroAuditoria
    await prisma.registroAuditoria.create({
      data: {
        usuarioId: usuario.id,
        accion: "LOGIN_EXITOSO",
        entidad: "Usuario",
        entidadId: usuario.id,
        detalle: "Inicio de sesión exitoso con creación de sesión persistente",
      },
    });

    // Generar Access Token de 15 minutos
    const accessToken = securityService.generateAccessToken({
      usuarioId: usuario.id,
      usuario: usuario.usuario,
      rolId: usuario.rolId,
      departamentoId: usuario.departamentoId,
      permisos,
      versionPermisos: usuario.versionPermisos,
    });

    return {
      usuario: {
        id: usuario.id,
        usuario: usuario.usuario,
        nombre: usuario.nombre,
        rol: {
          id: usuario.rol.id,
          codigo: usuario.rol.codigo,
          nombre: usuario.rol.nombre,
        },
        departamento: {
          id: usuario.departamento.id,
          codigo: usuario.departamento.codigo,
          nombre: usuario.departamento.nombre,
        },
        tipoSurtidoAlmacen: usuario.tipoSurtidoAlmacen,
        tipoMaterialAuditor: usuario.tipoMaterialAuditor,
        lineasAsignadas: usuario.lineasAsignadas.map((l) => l.lineaProduccion),
        permisos,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Renueva el Access Token de 15 minutos a partir de la cookie de sesión persistente
   */
  async refresh(refreshToken: string | undefined): Promise<RefreshResult> {
    if (!refreshToken) {
      throw new UnauthorizedError("No se proporcionó cookie de sesión válida");
    }

    const refreshTokenHash = securityService.hashRefreshToken(refreshToken);

    const sesion = await prisma.sesion.findUnique({
      where: { refreshTokenHash },
      include: {
        usuario: {
          include: {
            rol: true,
            departamento: true,
            lineasAsignadas: {
              where: { estado: "ACTIVO" },
              include: {
                lineaProduccion: {
                  select: { id: true, codigo: true, nombre: true, area: true },
                },
              },
            },
          },
        },
      },
    });

    if (!sesion) {
      throw new UnauthorizedError("Sesión inexistente");
    }

    if (sesion.estado !== "ACTIVO" || sesion.fechaRevocacion !== null) {
      throw new UnauthorizedError("Sesión revocada o inactiva");
    }

    const now = new Date();
    if (sesion.fechaExpiracion < now) {
      // Inactivar sesión expirada
      await prisma.sesion.update({
        where: { id: sesion.id },
        data: { estado: "INACTIVO" },
      });
      throw new UnauthorizedError("Sesión expirada. Debe iniciar sesión nuevamente.");
    }

    if (!sesion.usuario || sesion.usuario.estado !== "ACTIVO") {
      throw new UnauthorizedError("Usuario inactivo o dado de baja");
    }

    // Calcular permisos efectivos actualizados
    const permisos = await permissionService.calcularPermisosEfectivos(sesion.usuario.id);

    // Actualizar fecha de último uso en MySQL (cada refresh actualiza el heartbeat sin cambiar el ID de sesión)
    await prisma.sesion.update({
      where: { id: sesion.id },
      data: { fechaUltimoUso: now },
    });

    // Generar nuevo Access Token de 15 minutos
    const accessToken = securityService.generateAccessToken({
      usuarioId: sesion.usuario.id,
      usuario: sesion.usuario.usuario,
      rolId: sesion.usuario.rolId,
      departamentoId: sesion.usuario.departamentoId,
      permisos,
      versionPermisos: sesion.usuario.versionPermisos,
    });

    return {
      usuario: {
        id: sesion.usuario.id,
        usuario: sesion.usuario.usuario,
        nombre: sesion.usuario.nombre,
        rol: sesion.usuario.rol
          ? {
              id: sesion.usuario.rol.id,
              codigo: sesion.usuario.rol.codigo,
              nombre: sesion.usuario.rol.nombre,
            }
          : undefined,
        departamento: sesion.usuario.departamento
          ? {
              id: sesion.usuario.departamento.id,
              codigo: sesion.usuario.departamento.codigo,
              nombre: sesion.usuario.departamento.nombre,
            }
          : undefined,
        tipoSurtidoAlmacen: sesion.usuario.tipoSurtidoAlmacen,
        tipoMaterialAuditor: sesion.usuario.tipoMaterialAuditor,
        lineasAsignadas: sesion.usuario.lineasAsignadas?.map((l) => l.lineaProduccion) ?? [],
        permisos,
      },
      accessToken,
    };
  }

  /**
   * Cierra la sesión revocándola lógicamente en MySQL
   */
  async logout(refreshToken: string | undefined): Promise<{ loggedOut: boolean }> {
    if (!refreshToken) {
      return { loggedOut: true };
    }

    const refreshTokenHash = securityService.hashRefreshToken(refreshToken);

    const sesion = await prisma.sesion.findUnique({
      where: { refreshTokenHash },
    });

    if (sesion) {
      await prisma.sesion.update({
        where: { id: sesion.id },
        data: {
          estado: "INACTIVO",
          fechaRevocacion: new Date(),
        },
      });

      await prisma.registroAuditoria.create({
        data: {
          usuarioId: sesion.usuarioId,
          accion: "LOGOUT",
          entidad: "Sesion",
          entidadId: sesion.id,
          detalle: "Cierre voluntario de sesión y revocación lógica",
        },
      });
    }

    return { loggedOut: true };
  }

  /**
   * Valida que el usuario exista y se encuentre en estado ACTIVO.
   * Utilizado en la frontera de autenticación HTTP para asegurar el corte inmediato
   * de acceso aunque se posea un Access Token vigente previamente emitido.
   */
  async validateActiveUser(usuarioId: number): Promise<{ id: number; estado: string; versionPermisos: number }> {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, estado: true, versionPermisos: true },
    });

    if (!usuario || usuario.estado !== "ACTIVO") {
      throw new UnauthorizedError("Usuario inactivo o inexistente");
    }

    return usuario;
  }

  /**
   * Obtiene la lista pública de nombres de usuarios activos para el selector de Login.
   * Expone campos no sensibles: id, nombre, usuario y código de rol para ordenamiento UI.
   */
  async getUsuariosActivosPublicos(): Promise<{ id: number; nombre: string; usuario: string; rol?: { codigo: string } }[]> {
    return prisma.usuario.findMany({
      where: { estado: "ACTIVO" },
      select: {
        id: true,
        nombre: true,
        usuario: true,
        rol: {
          select: {
            codigo: true,
          },
        },
      },
      orderBy: { nombre: "asc" },
    });
  }
}

export const sessionService = new SessionService();
