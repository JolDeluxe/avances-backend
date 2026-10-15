import { prisma } from "../../config/database";
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from "../../utils/errors";
import { securityService } from "../auth/services/security.service";
import { permissionService } from "../auth/services/permission.service";
import { scopeService } from "../auth/services/scope.service";
import { PERMISOS, type PermisoCodigo } from "../../config/permissions";
import type { CreateUserInput, UpdateUserInput, FilterUsersInput, ResetPasswordInput } from "./users.schema";

export class UsersService {
  async getUsers(filters: FilterUsersInput = {}, actorId?: number) {
    const pagina = filters.pagina ?? 1;
    const limite = filters.limite ?? 50;
    const saltar = (pagina - 1) * limite;

    const where: Record<string, unknown> = {};

    // Aislamiento Departamental:
    // Si actorId está presente, resolver su alcance.
    // SUPER_ADMIN (scope.esGlobal): puede ver todos o filtrar por cualquier departamentoId.
    // ADMIN (no global): confinado estrictamente a su propio departamentoId.
    const estadoFiltro = filters.estado ?? "ACTIVO";
    if (estadoFiltro !== "TODOS") {
      where.estado = estadoFiltro;
    }

    if (actorId) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal) {
        if (filters.departamentoId && filters.departamentoId !== scope.departamentoId) {
          throw new ForbiddenError("No tiene autorización para consultar usuarios de otro departamento");
        }
        where.departamentoId = scope.departamentoId;
      } else if (filters.departamentoId) {
        where.departamentoId = filters.departamentoId;
      }
    } else if (filters.departamentoId) {
      where.departamentoId = filters.departamentoId;
    }

    // Clonar base de filtrado de alcance y estado (sin filtros específicos de rol, segmentación ni búsqueda)
    // para calcular los conteos reales del Summary Bar independientes del rol seleccionado
    const whereSummaryBase = { ...where };

    if (filters.rolId) {
      where.rolId = filters.rolId;
    }

    if (filters.tipoSurtidoAlmacen) {
      where.tipoSurtidoAlmacen = filters.tipoSurtidoAlmacen;
    }

    if (filters.tipoMaterialAuditor) {
      where.tipoMaterialAuditor = filters.tipoMaterialAuditor;
    }

    if (filters.busqueda && filters.busqueda.trim() !== "") {
      const term = filters.busqueda.trim();
      where.OR = [
        { usuario: { contains: term } },
        { nombre: { contains: term } },
      ];
    }

    // Prioridad canónica de orden por roles:
    // 1. SUPER_ADMIN, 2. ADMIN, 3. REGISTRADOR, 4. AUDITOR, 5. ALMACENISTA
    const ROLE_PRIORITY: Record<string, number> = {
      SUPER_ADMIN: 1,
      ADMIN: 2,
      REGISTRADOR: 3,
      AUDITOR: 4,
      ALMACENISTA: 5,
    };

    const [total, usuarios, usuariosSummary] = await Promise.all([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        include: {
          rol: {
            select: { id: true, codigo: true, nombre: true },
          },
          departamento: {
            select: { id: true, codigo: true, nombre: true },
          },
          lineasAsignadas: {
            where: {
              estado: "ACTIVO",
              lineaProduccion: { estado: "ACTIVO" },
            },
            include: {
              lineaProduccion: {
                select: { id: true, codigo: true, nombre: true, area: true, orden: true },
              },
            },
          },
        },
      }),
      // Consulta para el Summary Bar: agrupa/cuenta los usuarios según su rol dentro del alcance del usuario y estado activo/inactivo
      prisma.usuario.findMany({
        where: whereSummaryBase,
        select: {
          rol: {
            select: { codigo: true },
          },
        },
      }),
    ]);

    // Calcular estadísticas globales de roles para el summary bar
    const statsPorRol: Record<string, number> = {
      TOTAL: usuariosSummary.length,
      ADMIN: 0,
      ALMACENISTA: 0,
      AUDITOR: 0,
      REGISTRADOR: 0,
    };

    for (const u of usuariosSummary) {
      const cod = u.rol?.codigo;
      if (cod === "ADMIN" || cod === "SUPER_ADMIN") {
        statsPorRol.ADMIN = (statsPorRol.ADMIN ?? 0) + 1;
      } else if (cod === "ALMACENISTA") {
        statsPorRol.ALMACENISTA = (statsPorRol.ALMACENISTA ?? 0) + 1;
      } else if (cod === "AUDITOR") {
        statsPorRol.AUDITOR = (statsPorRol.AUDITOR ?? 0) + 1;
      } else if (cod === "REGISTRADOR") {
        statsPorRol.REGISTRADOR = (statsPorRol.REGISTRADOR ?? 0) + 1;
      }
    }

    // Ordenamiento jerárquico por rol y luego alfabético
    usuarios.sort((a, b) => {
      const pA = ROLE_PRIORITY[a.rol?.codigo ?? ""] ?? 99;
      const pB = ROLE_PRIORITY[b.rol?.codigo ?? ""] ?? 99;
      if (pA !== pB) return pA - pB;
      const compNombre = (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" });
      if (compNombre !== 0) return compNombre;
      return (a.usuario ?? "").localeCompare(b.usuario ?? "", "es", { sensitivity: "base" });
    });

    // Paginación en memoria respetando el ordenamiento por jerarquía de roles
    const paginados = usuarios.slice(saltar, saltar + limite);

    const AREA_ORDER: Record<string, number> = { BOTA: 1, ACCESORIOS: 2 };

    const items = paginados.map((u) => {
      const lineasOrdenadas = u.lineasAsignadas
        .map((l) => l.lineaProduccion)
        .sort((a, b) => {
          const areaA = AREA_ORDER[a.area ?? ''] ?? 99;
          const areaB = AREA_ORDER[b.area ?? ''] ?? 99;
          if (areaA !== areaB) return areaA - areaB;
          return (a.orden ?? 0) - (b.orden ?? 0);
        });

      return {
        id: u.id,
        usuario: u.usuario,
        nombre: u.nombre,
        rol: u.rol,
        departamento: u.departamento,
        tipoSurtidoAlmacen: u.tipoSurtidoAlmacen,
        tipoMaterialAuditor: u.tipoMaterialAuditor,
        estado: u.estado,
        lineasAsignadas: lineasOrdenadas,
        fechaCreacion: u.fechaCreacion,
        fechaActualizacion: u.fechaActualizacion,
      };
    });

    return {
      total,
      pagina,
      limite,
      totalPaginas: Math.ceil(total / limite),
      statsPorRol,
      items,
    };
  }

  async getUserById(id: number, actorId?: number) {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      include: {
        rol: {
          select: { id: true, codigo: true, nombre: true },
        },
        departamento: {
          select: { id: true, codigo: true, nombre: true },
        },
        lineasAsignadas: {
          where: {
            estado: "ACTIVO",
            lineaProduccion: { estado: "ACTIVO" },
          },
          include: {
            lineaProduccion: {
              select: { id: true, codigo: true, nombre: true, area: true, orden: true, departamentoId: true },
            },
          },
        },
        excepcionesPermiso: {
          where: { estado: "ACTIVO" },
          include: {
            permiso: {
              select: { id: true, codigo: true, modulo: true, descripcion: true },
            },
          },
        },
      },
    });

    if (!usuario) {
      throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
    }

    const AREA_ORDER: Record<string, number> = { BOTA: 1, ACCESORIOS: 2 };
    usuario.lineasAsignadas.sort((a, b) => {
      const areaA = AREA_ORDER[a.lineaProduccion.area ?? ''] ?? 99;
      const areaB = AREA_ORDER[b.lineaProduccion.area ?? ''] ?? 99;
      if (areaA !== areaB) return areaA - areaB;
      return (a.lineaProduccion.orden ?? 0) - (b.lineaProduccion.orden ?? 0);
    });

    // Aislamiento Departamental:
    // Si actorId está presente y no es SUPER_ADMIN, solo puede acceder a usuarios de su propio departamento.
    if (actorId && actorId !== usuario.id) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal && scope.departamentoId !== usuario.departamentoId) {
        throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
      }
    }

    const permisosEfectivos = await permissionService.calcularPermisosEfectivos(usuario.id);

    return {
      id: usuario.id,
      usuario: usuario.usuario,
      nombre: usuario.nombre,
      rol: usuario.rol,
      departamento: usuario.departamento,
      tipoSurtidoAlmacen: usuario.tipoSurtidoAlmacen,
      tipoMaterialAuditor: usuario.tipoMaterialAuditor,
      estado: usuario.estado,
      lineasAsignadas: usuario.lineasAsignadas.map((l) => l.lineaProduccion),
      excepcionesPermiso: usuario.excepcionesPermiso.map((e) => ({
        id: e.id,
        permisoId: e.permiso.id,
        codigo: e.permiso.codigo,
        modulo: e.permiso.modulo,
        descripcion: e.permiso.descripcion,
        accion: e.accion,
      })),
      permisosEfectivos,
      fechaCreacion: usuario.fechaCreacion,
      fechaActualizacion: usuario.fechaActualizacion,
    };
  }

  /**
   * Genera un identificador de usuario limpio, profesional y completo a partir del nombre y apellido.
   * Contempla partículas compuestas hispanas como "de Oca", "De La Torre", "del Río", "San Juan", etc.
   * Si existe colisión, agrega un correlativo secuencial (ej. amontesdeoca, amontesdeoca2).
   */
  async generateUniqueUsername(nombreCompleto: string, usuarioActualId?: number): Promise<string> {
    const PARTICULAS = new Set(["de", "del", "la", "las", "los", "san", "santa"]);

    // 1. Limpiar acentos y caracteres especiales
    const normalizado = nombreCompleto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    // 2. Extraer palabras alfanuméricas
    const tokens = normalizado.split(/\s+/).filter((t) => /^[a-z0-9]+$/.test(t));
    if (tokens.length === 0) {
      return "usuario";
    }

    const usernameBaseRaw =
      tokens.length === 1 && tokens[0]
        ? tokens[0]
        : (() => {
            const primerNombre = tokens[0] || "u";
            const inicial = primerNombre.charAt(0);

            // Reconstruir apellidos uniendo partículas (ej: ["montes", "de", "oca"] -> "montesdeoca")
            const partesRestantes = tokens.slice(1);
            const apellidoTokens: string[] = [];

            for (let i = 0; i < partesRestantes.length; i++) {
              const t = partesRestantes[i];
              if (!t) continue;
              if (PARTICULAS.has(t)) {
                // Si es partícula y le sigue otra palabra, concatenar
                if (i + 1 < partesRestantes.length) {
                  apellidoTokens.push(t);
                }
              } else {
                apellidoTokens.push(t);
              }
            }

            const apellidoUnido = apellidoTokens.join("");
            return `${inicial}${apellidoUnido}`;
          })();

    let usernameBase = usernameBaseRaw.slice(0, 30);
    if (!usernameBase || usernameBase.length < 2) {
      usernameBase = "user";
    }

    // Verificar unicidad en BD
    let candidato = usernameBase;
    let contador = 1;

    while (true) {
      const existente = await prisma.usuario.findUnique({
        where: { usuario: candidato },
        select: { id: true },
      });

      if (!existente || (usuarioActualId && existente.id === usuarioActualId)) {
        return candidato;
      }

      contador++;
      candidato = `${usernameBase}${contador}`;
    }
  }

  async createUser(data: CreateUserInput, actorId?: number) {
    // 1. Resolver nombre de usuario: si no se envía o viene vacío, autogenerar
    let usuarioFinal = (data.usuario || "").trim().toLowerCase();
    if (!usuarioFinal) {
      usuarioFinal = await this.generateUniqueUsername(data.nombre);
    } else {
      const existeUsuario = await prisma.usuario.findUnique({
        where: { usuario: usuarioFinal },
      });
      if (existeUsuario) {
        throw new ConflictError(`El nombre de usuario '${usuarioFinal}' ya está en uso`);
      }
    }

    // 2. Validar que el rol exista y esté activo
    const rol = await prisma.rol.findUnique({
      where: { id: data.rolId },
    });
    if (!rol || rol.estado !== "ACTIVO") {
      throw new BadRequestError(`El rol seleccionado (ID ${data.rolId}) no existe o está inactivo`);
    }

    // Blindaje Jerárquico: ADMIN no puede crear usuarios con rol SUPER_ADMIN
    if (rol.codigo === "SUPER_ADMIN" && actorId) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal) {
        throw new ForbiddenError("Operación denegada: Un ADMIN no puede crear usuarios con rol SUPER_ADMIN");
      }
    }

    // 3. Validar que el departamento exista y esté activo
    const departamento = await prisma.departamento.findUnique({
      where: { id: data.departamentoId },
    });
    if (!departamento || departamento.estado !== "ACTIVO") {
      throw new BadRequestError(
        `El departamento seleccionado (ID ${data.departamentoId}) no existe o está inactivo`,
      );
    }

    // Aislamiento Departamental:
    // Si actorId no es global (SUPER_ADMIN), solo puede crear usuarios en su propio departamento.
    if (actorId) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal && scope.departamentoId !== data.departamentoId) {
        throw new ForbiddenError("No tiene autorización para crear usuarios en otro departamento");
      }
    }

    // 4. Regla de Negocio: Líneas de Producción y Segmentación Operativa
    // ADMIN, AUDITOR y SUPER_ADMIN NO pertenecen a una línea de producción.
    // Solo ALMACENISTA se encarga de surtir líneas específicas dentro de su departamento.
    let lineasParaAsignar: number[] = [];
    const tipoSurtidoEfectivo = data.tipoSurtidoAlmacen ?? null;
    const tipoMaterialAuditorEfectivo = data.tipoMaterialAuditor ?? null;

    if (rol.codigo === "ALMACENISTA") {
      if (!tipoSurtidoEfectivo) {
        throw new BadRequestError("El rol ALMACENISTA requiere especificar un tipo de surtido (DIRECTOS, INDIRECTOS, BOLSAS o TODOS)");
      }
      if (tipoMaterialAuditorEfectivo) {
        throw new BadRequestError("El rol ALMACENISTA no debe tener segmentación de AUDITOR");
      }

      if (data.lineaProduccionIds && data.lineaProduccionIds.length > 0) {
        const lineas = await prisma.lineaProduccion.findMany({
          where: {
            id: { in: data.lineaProduccionIds },
            estado: "ACTIVO",
          },
        });

        if (lineas.length !== data.lineaProduccionIds.length) {
          throw new BadRequestError(
            "Una o más líneas de producción seleccionadas no existen o están inactivas",
          );
        }

        // Validar que cada línea pertenezca al departamento del usuario
        for (const linea of lineas) {
          if (linea.departamentoId !== data.departamentoId) {
            throw new BadRequestError(
              `La línea de producción '${linea.nombre}' no pertenece al departamento '${departamento.nombre}'`,
            );
          }
          // Regla: Si solo surte BOLSAS (sin DIRECTOS ni INDIRECTOS), no puede tener líneas de área BOTA
          const frentesList = tipoSurtidoEfectivo.split(",").map((s) => s.trim().toUpperCase());
          const soloBolsas = frentesList.includes("BOLSAS") && !frentesList.includes("DIRECTOS") && !frentesList.includes("INDIRECTOS") && !frentesList.includes("TODOS");
          if (soloBolsas && linea.area === "BOTA") {
            throw new BadRequestError("Un almacenista asignado exclusivamente a BOLSAS no puede tener líneas de área BOTA");
          }
        }

        lineasParaAsignar = data.lineaProduccionIds;
      }
    } else if (rol.codigo === "AUDITOR") {
      if (!tipoMaterialAuditorEfectivo) {
        throw new BadRequestError("El rol AUDITOR requiere especificar un tipo de material (DIRECTOS, INDIRECTOS, TODOS)");
      }
      if (tipoSurtidoEfectivo) {
        throw new BadRequestError("El rol AUDITOR no debe tener segmentación de ALMACENISTA");
      }
    } else {
      if (tipoSurtidoEfectivo || tipoMaterialAuditorEfectivo) {
        throw new BadRequestError(`El rol ${rol.codigo} no debe tener segmentación operativa de ALMACENISTA ni AUDITOR`);
      }
    }

    // 5. Validar excepciones de permisos si se proporcionan
    if (data.excepciones && data.excepciones.length > 0) {
      const permisoIds = data.excepciones.map((e) => e.permisoId);
      const permisos = await prisma.permiso.findMany({
        where: {
          id: { in: permisoIds },
          estado: "ACTIVO",
        },
      });

      if (permisos.length !== permisoIds.length) {
        throw new BadRequestError(
          "Uno o más permisos especificados en las excepciones no existen o están inactivos",
        );
      }

      for (const exc of data.excepciones) {
        if (exc.accion !== "CONCEDER") {
          throw new BadRequestError("Solo se permiten excepciones positivas (CONCEDER)");
        }
      }

      if (actorId) {
        const scope = await scopeService.resolveUserScope(actorId);
        if (!scope.esGlobal) {
          const actorPermisos = await permissionService.calcularPermisosEfectivos(actorId);
          const permisosSistemaReservados = new Set<string>([
            PERMISOS.PERMISO_ADMINISTRAR,
            PERMISOS.DEPARTAMENTO_ADMINISTRAR,
            PERMISOS.REGISTRO_SISTEMA_VER,
          ]);

          for (const exc of data.excepciones) {
            const permObj = permisos.find((p) => p.id === exc.permisoId);
            if (!permObj) continue;

            if (permisosSistemaReservados.has(permObj.codigo)) {
              throw new ForbiddenError(
                `Operación denegada: El permiso de sistema '${permObj.codigo}' está reservado a SUPER_ADMIN y no puede otorgarse como excepción`,
              );
            }

            if (!actorPermisos.includes(permObj.codigo as PermisoCodigo)) {
              throw new ForbiddenError(
                `Operación denegada: No puede otorgar el permiso '${permObj.codigo}' como excepción porque usted no lo posee`,
              );
            }
          }
        }
      }
    }

    // 6. Hashear contraseña para autenticación y cifrar de forma reversible para revelación administrativa
    const passwordHash = securityService.hashPassword(data.password);
    const passwordEncrypted = securityService.encryptPassword(data.password);

    // 7. Crear usuario y relaciones de forma transaccional
    const usuarioCreado = await prisma.$transaction(async (tx) => {
      const nuevoUsuario = await tx.usuario.create({
        data: {
          usuario: usuarioFinal,
          nombre: data.nombre,
          passwordHash,
          passwordEncrypted,
          rolId: data.rolId,
          departamentoId: data.departamentoId,
          tipoSurtidoAlmacen: tipoSurtidoEfectivo,
          tipoMaterialAuditor: tipoMaterialAuditorEfectivo,
          estado: "ACTIVO",
        },
      });

      // Asignar líneas de producción si aplica
      if (lineasParaAsignar.length > 0) {
        await tx.usuarioLineaProduccion.createMany({
          data: lineasParaAsignar.map((lineaId) => ({
            usuarioId: nuevoUsuario.id,
            lineaProduccionId: lineaId,
            estado: "ACTIVO",
          })),
        });
      }

      // Asignar excepciones de permisos si aplica
      if (data.excepciones && data.excepciones.length > 0) {
        await tx.excepcionPermisoUsuario.createMany({
          data: data.excepciones.map((exc) => ({
            usuarioId: nuevoUsuario.id,
            permisoId: exc.permisoId,
            accion: exc.accion,
            estado: "ACTIVO",
          })),
        });
      }

      // Bitácora de Auditoría
      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId ?? null,
          accion: "USUARIO_CREADO",
          entidad: "usuarios",
          entidadId: nuevoUsuario.id,
          detalle: `Usuario creado: ${nuevoUsuario.usuario} [${rol.codigo}] en departamento ${departamento.codigo}`,
        },
      });

      return nuevoUsuario;
    });

    return this.getUserById(usuarioCreado.id);
  }

  async updateUser(id: number, data: UpdateUserInput, actorId?: number) {
    const usuarioActual = await prisma.usuario.findUnique({
      where: { id },
      include: { rol: true, departamento: true },
    });

    if (!usuarioActual) {
      throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
    }

    // Blindaje Jerárquico: Usuarios no SUPER_ADMIN (ej. ADMIN) no pueden modificar a un SUPER_ADMIN
    if (usuarioActual.rol.codigo === "SUPER_ADMIN" && actorId && actorId !== usuarioActual.id) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal) {
        throw new ForbiddenError("Operación denegada: Un ADMIN no puede modificar a un SUPER_ADMIN");
      }
    }

    // Protección de contraseña de SUPER_ADMIN: Solo el propio SUPER_ADMIN u otro SUPER_ADMIN puede cambiarla (no roles inferiores)
    if (usuarioActual.rol.codigo === "SUPER_ADMIN" && data.password && actorId && actorId !== id) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal) {
        throw new ForbiddenError(
          "Operación denegada: La contraseña de un SUPER_ADMIN solo puede ser modificada por un SUPER_ADMIN",
        );
      }
    }

    // Aislamiento Departamental:
    // Si actorId está presente y no es SUPER_ADMIN, solo puede modificar usuarios de su mismo departamento
    // y no puede transferir usuarios a otro departamento.
    if (actorId && actorId !== usuarioActual.id) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal) {
        if (scope.departamentoId !== usuarioActual.departamentoId) {
          throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
        }
        if (data.departamentoId && data.departamentoId !== scope.departamentoId) {
          throw new ForbiddenError("No tiene autorización para transferir usuarios a otro departamento");
        }
      }
    }

    const nuevoRolId = data.rolId ?? usuarioActual.rolId;
    const nuevoDepartamentoId = data.departamentoId ?? usuarioActual.departamentoId;

    // Protección de SUPER_ADMIN: No revocar el rol de SUPER_ADMIN al único superadministrador activo
    if (usuarioActual.rol.codigo === "SUPER_ADMIN" && nuevoRolId !== usuarioActual.rolId) {
      const totalSuperAdmins = await prisma.usuario.count({
        where: { rol: { codigo: "SUPER_ADMIN" }, estado: "ACTIVO" },
      });
      if (totalSuperAdmins <= 1) {
        throw new BadRequestError(
          "Operación no permitida: No se puede cambiar el rol al único SUPER_ADMIN activo del sistema",
        );
      }
    }

    // Validar rol si cambió
    let rolEfectivo = usuarioActual.rol;
    if (data.rolId && data.rolId !== usuarioActual.rolId) {
      const rolEncontrado = await prisma.rol.findUnique({ where: { id: data.rolId } });
      if (!rolEncontrado || rolEncontrado.estado !== "ACTIVO") {
        throw new BadRequestError(`El rol ID ${data.rolId} no existe o está inactivo`);
      }

      // Blindaje Jerárquico: ADMIN no puede promover ni asignar el rol SUPER_ADMIN
      if (rolEncontrado.codigo === "SUPER_ADMIN" && actorId) {
        const scope = await scopeService.resolveUserScope(actorId);
        if (!scope.esGlobal) {
          throw new ForbiddenError("Operación denegada: Un ADMIN no puede asignar ni promover al rol SUPER_ADMIN");
        }
      }

      rolEfectivo = rolEncontrado;
    }

    // Validar departamento si cambió
    let deptoEfectivo = usuarioActual.departamento;
    if (data.departamentoId && data.departamentoId !== usuarioActual.departamentoId) {
      const deptoEncontrado = await prisma.departamento.findUnique({
        where: { id: data.departamentoId },
      });
      if (!deptoEncontrado || deptoEncontrado.estado !== "ACTIVO") {
        throw new BadRequestError(`El departamento ID ${data.departamentoId} no existe o está inactivo`);
      }
      deptoEfectivo = deptoEncontrado;
    }

    // Regla de asignación de líneas y segmentación operativa:
    let lineasParaAsignar: number[] | null = null;
    let nuevoTipoSurtido = data.tipoSurtidoAlmacen !== undefined ? data.tipoSurtidoAlmacen : usuarioActual.tipoSurtidoAlmacen;
    let nuevoTipoAuditor = data.tipoMaterialAuditor !== undefined ? data.tipoMaterialAuditor : usuarioActual.tipoMaterialAuditor;

    if (rolEfectivo.codigo === "ALMACENISTA") {
      if (!nuevoTipoSurtido) {
        throw new BadRequestError("El rol ALMACENISTA requiere especificar un tipo de surtido (DIRECTOS, INDIRECTOS, BOLSAS o TODOS)");
      }
      if (nuevoTipoAuditor) {
        // Almacenista no puede tener segmentación de auditor.
        nuevoTipoAuditor = null;
      }
      if (data.lineaProduccionIds !== undefined) {
        if (data.lineaProduccionIds.length > 0) {
          const lineas = await prisma.lineaProduccion.findMany({
            where: {
              id: { in: data.lineaProduccionIds },
              estado: "ACTIVO",
            },
          });

          if (lineas.length !== data.lineaProduccionIds.length) {
            throw new BadRequestError(
              "Una o más líneas de producción seleccionadas no existen o están inactivas",
            );
          }

          for (const linea of lineas) {
            if (linea.departamentoId !== nuevoDepartamentoId) {
              throw new BadRequestError(
                `La línea '${linea.nombre}' no pertenece al departamento '${deptoEfectivo.nombre}'`,
              );
            }
            // Regla: Si solo surte BOLSAS (sin DIRECTOS ni INDIRECTOS), no puede tener líneas de área BOTA
            const frentesList = (nuevoTipoSurtido || "").split(",").map((s) => s.trim().toUpperCase());
            const soloBolsas = frentesList.includes("BOLSAS") && !frentesList.includes("DIRECTOS") && !frentesList.includes("INDIRECTOS") && !frentesList.includes("TODOS");
            if (soloBolsas && linea.area === "BOTA") {
              throw new BadRequestError("Un almacenista asignado exclusivamente a BOLSAS no puede tener líneas de área BOTA");
            }
          }
        }
        lineasParaAsignar = data.lineaProduccionIds;
      }
    } else if (rolEfectivo.codigo === "AUDITOR") {
      if (!nuevoTipoAuditor) {
        throw new BadRequestError("El rol AUDITOR requiere especificar un tipo de material (DIRECTOS, INDIRECTOS, TODOS)");
      }
      if (nuevoTipoSurtido) {
        nuevoTipoSurtido = null;
      }
      lineasParaAsignar = [];
    } else {
      nuevoTipoSurtido = null;
      nuevoTipoAuditor = null;
      lineasParaAsignar = [];
    }

    // Validar excepciones si se envían
    if (data.excepciones !== undefined && data.excepciones.length > 0) {
      const permisoIds = data.excepciones.map((e) => e.permisoId);
      const permisos = await prisma.permiso.findMany({
        where: {
          id: { in: permisoIds },
          estado: "ACTIVO",
        },
      });

      if (permisos.length !== permisoIds.length) {
        throw new BadRequestError("Uno o más permisos especificados no existen o están inactivos");
      }

      for (const exc of data.excepciones) {
        if (exc.accion !== "CONCEDER") {
          throw new BadRequestError("Solo se permiten excepciones positivas (CONCEDER)");
        }
      }

      if (actorId) {
        const scope = await scopeService.resolveUserScope(actorId);
        if (!scope.esGlobal) {
          const actorPermisos = await permissionService.calcularPermisosEfectivos(actorId);
          const permisosSistemaReservados = new Set<string>([
            PERMISOS.PERMISO_ADMINISTRAR,
            PERMISOS.DEPARTAMENTO_ADMINISTRAR,
            PERMISOS.REGISTRO_SISTEMA_VER,
          ]);

          for (const exc of data.excepciones) {
            const permObj = permisos.find((p) => p.id === exc.permisoId);
            if (!permObj) continue;

            if (permisosSistemaReservados.has(permObj.codigo)) {
              throw new ForbiddenError(
                `Operación denegada: El permiso de sistema '${permObj.codigo}' está reservado a SUPER_ADMIN y no puede otorgarse como excepción`,
              );
            }

            if (!actorPermisos.includes(permObj.codigo as PermisoCodigo)) {
              throw new ForbiddenError(
                `Operación denegada: No puede otorgar el permiso '${permObj.codigo}' como excepción porque usted no lo posee`,
              );
            }
          }
        }
      }
    }

    // Preparar hash y cifrado de contraseña si se solicitó cambio
    const passwordHash = data.password ? securityService.hashPassword(data.password) : undefined;
    const passwordEncrypted = data.password ? securityService.encryptPassword(data.password) : undefined;

    // Si cambia el nombre, autogenerar nuevo nombre de usuario único basado en el nuevo nombre
    let nuevoUsuario: string | undefined = undefined;
    if (data.nombre && data.nombre.trim() !== usuarioActual.nombre) {
      nuevoUsuario = await this.generateUniqueUsername(data.nombre, id);
    }

    // Detectar si hubo cambios en permisos para invalidar versión de permisos del usuario
    const huboCambioPermisos =
      (data.rolId !== undefined && data.rolId !== usuarioActual.rolId) ||
      data.excepciones !== undefined;

    // Ejecutar actualización en transacción
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          ...(data.nombre && { nombre: data.nombre.trim() }),
          ...(nuevoUsuario && { usuario: nuevoUsuario }),
          ...(passwordHash && { passwordHash }),
          ...(passwordEncrypted && { passwordEncrypted }),
          ...(data.rolId && { rolId: data.rolId }),
          ...(data.departamentoId && { departamentoId: data.departamentoId }),
          tipoSurtidoAlmacen: nuevoTipoSurtido,
          tipoMaterialAuditor: nuevoTipoAuditor,
          ...(data.estado && { estado: data.estado }),
          ...(huboCambioPermisos && { versionPermisos: { increment: 1 } }),
        },
      });

      // Sincronizar líneas de producción si se especificaron o si el rol cambió a uno sin líneas
      if (lineasParaAsignar !== null) {
        await tx.usuarioLineaProduccion.deleteMany({
          where: { usuarioId: id },
        });

        if (lineasParaAsignar.length > 0) {
          await tx.usuarioLineaProduccion.createMany({
            data: lineasParaAsignar.map((lineaId) => ({
              usuarioId: id,
              lineaProduccionId: lineaId,
              estado: "ACTIVO",
            })),
          });
        }
      }

      // Sincronizar excepciones de permisos si se especificaron
      if (data.excepciones !== undefined) {
        await tx.excepcionPermisoUsuario.deleteMany({
          where: { usuarioId: id },
        });

        if (data.excepciones.length > 0) {
          await tx.excepcionPermisoUsuario.createMany({
            data: data.excepciones.map((exc) => ({
              usuarioId: id,
              permisoId: exc.permisoId,
              accion: exc.accion,
              estado: "ACTIVO",
            })),
          });
        }
      }

      // Si se inactiva el usuario o se cambia la contraseña, revocar todas sus sesiones activas
      if (data.estado === "INACTIVO" || passwordHash) {
        await tx.sesion.updateMany({
          where: { usuarioId: id, estado: "ACTIVO" },
          data: {
            estado: "INACTIVO",
            fechaRevocacion: new Date(),
          },
        });
      }

      // Registrar auditoría
      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId ?? null,
          accion: "USUARIO_MODIFICADO",
          entidad: "usuarios",
          entidadId: id,
          detalle: `Usuario modificado: ${usuarioActual.usuario}`,
        },
      });
    });

    return this.getUserById(id);
  }

  async deleteUser(id: number, actorId?: number) {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      include: { rol: true },
    });

    if (!usuario) {
      throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
    }

    // Blindaje Jerárquico: No permitir que un ADMIN inactive a un SUPER_ADMIN (regla absoluta previa a scope)
    if (usuario.rol.codigo === "SUPER_ADMIN") {
      if (actorId && actorId !== usuario.id) {
        const scope = await scopeService.resolveUserScope(actorId);
        if (!scope.esGlobal) {
          throw new ForbiddenError("Operación denegada: Un ADMIN no puede desactivar a un SUPER_ADMIN");
        }
      }

      const totalSuperAdmins = await prisma.usuario.count({
        where: { rol: { codigo: "SUPER_ADMIN" }, estado: "ACTIVO" },
      });
      if (totalSuperAdmins <= 1) {
        throw new BadRequestError(
          "Operación no permitida: No se puede inactivar al único SUPER_ADMIN activo del sistema",
        );
      }
    }

    // Aislamiento Departamental:
    if (actorId && actorId !== usuario.id) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal && scope.departamentoId !== usuario.departamentoId) {
        throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
      }
    }

    // Borrado lógico y revocación de sesiones
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: { estado: "INACTIVO" },
      });

      await tx.sesion.updateMany({
        where: { usuarioId: id, estado: "ACTIVO" },
        data: {
          estado: "INACTIVO",
          fechaRevocacion: new Date(),
        },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId ?? null,
          accion: "USUARIO_INACTIVADO",
          entidad: "usuarios",
          entidadId: id,
          detalle: `Usuario inactivado lógicamente y sesiones revocadas: ${usuario.usuario}`,
        },
      });
    });

    return { mensaje: `Usuario ${usuario.usuario} inactivado exitosamente` };
  }

  async reactivateUser(id: number, actorId?: number) {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
    });

    if (!usuario) {
      throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
    }

    // Aislamiento Departamental:
    if (actorId && actorId !== usuario.id) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal && scope.departamentoId !== usuario.departamentoId) {
        throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: { estado: "ACTIVO" },
      });

      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId ?? null,
          accion: "USUARIO_REACTIVADO",
          entidad: "usuarios",
          entidadId: id,
          detalle: `Usuario reactivado: ${usuario.usuario}`,
        },
      });
    });

    return this.getUserById(id);
  }

  /**
   * Restablecimiento administrativo de contraseña para usuarios.
   *
   * Reglas de negocio y seguridad:
   * 1. ADMIN puede cambiar contraseña de cualquier usuario excepto SUPER_ADMIN.
   * 2. SUPER_ADMIN puede cambiar contraseña de cualquier usuario excepto otro SUPER_ADMIN.
   * 3. SUPER_ADMIN está blindado contra modificaciones por parte de otros administradores.
   * 4. Revoca todas las sesiones activas del usuario afectado para forzar re-autenticación.
   * 5. Registra auditoría transversal sin exponer contraseñas en texto plano ni hashes.
   */
  async resetUserPassword(targetUserId: number, input: ResetPasswordInput, actorId?: number) {
    const targetUser = await prisma.usuario.findUnique({
      where: { id: targetUserId },
      include: { rol: true },
    });

    if (!targetUser) {
      throw new NotFoundError("Usuario no encontrado");
    }

    // Regla de Protección de SUPER_ADMIN:
    // - Si el usuario objetivo es SUPER_ADMIN y el actor no tiene alcance global (ej. es un ADMIN),
    // no se le permite modificar la contraseña de un SUPER_ADMIN.
    // - Un SUPER_ADMIN o el propio usuario sí puede restablecerla.
    if (targetUser.rol.codigo === "SUPER_ADMIN" && actorId && actorId !== targetUserId) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal) {
        throw new ForbiddenError(
          "Operación denegada: La contraseña de un SUPER_ADMIN no puede ser modificada por otro usuario sin rol SUPER_ADMIN",
        );
      }
    }

    if (targetUser.estado !== "ACTIVO") {
      throw new NotFoundError("Usuario no encontrado o inactivo");
    }

    // Aislamiento Departamental:
    if (actorId && actorId !== targetUser.id) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal && scope.departamentoId !== targetUser.departamentoId) {
        throw new NotFoundError("Usuario no encontrado o inactivo");
      }
    }

    // Hashear nueva contraseña para autenticación y cifrar de forma reversible para revelación administrativa
    const newPasswordHash = securityService.hashPassword(input.newPassword);
    const newPasswordEncrypted = securityService.encryptPassword(input.newPassword);

    await prisma.$transaction(async (tx) => {
      // 1. Actualizar contraseña (hash y cifrada reversible)
      await tx.usuario.update({
        where: { id: targetUserId },
        data: {
          passwordHash: newPasswordHash,
          passwordEncrypted: newPasswordEncrypted,
        },
      });

      // 2. Revocar todas las sesiones activas del usuario objetivo para invalidar accesos previos
      await tx.sesion.updateMany({
        where: { usuarioId: targetUserId, estado: "ACTIVO" },
        data: {
          estado: "INACTIVO",
          fechaRevocacion: new Date(),
        },
      });

      // 3. Registrar auditoría transversal
      await tx.registroAuditoria.create({
        data: {
          usuarioId: actorId ?? null,
          accion: "USUARIO_PASSWORD_RESTABLECIDO",
          entidad: "usuarios",
          entidadId: targetUserId,
          detalle: `Contraseña restablecida administrativamente para usuario: ${targetUser.usuario}`,
        },
      });
    });

    return { message: "Contraseña restablecida exitosamente" };
  }

  /**
   * Revelar y consultar la contraseña actual de un usuario (Capacidad Administrativa Reversible).
   *
   * Reglas de negocio y seguridad:
   * 1. Requiere permiso canónico 'usuario:password:ver'.
   * 2. SUPER_ADMIN puede revelar contraseñas dentro de su alcance global (excepto otro SUPER_ADMIN).
   * 3. ADMIN puede revelar contraseñas únicamente dentro de su alcance departamental.
   * 4. Blindaje de SUPER_ADMIN: La contraseña de un SUPER_ADMIN NO puede ser revelada
   *    ni por un ADMIN ni por otro SUPER_ADMIN (regla absoluta e independiente de departamento).
   * 5. El usuario debe existir y estar ACTIVO.
   * 6. La operación genera trazabilidad transversal en RegistroAuditoria con acción
   *    'USUARIO_PASSWORD_REVELADO', sin registrar jamás contraseñas, hashes, claves ni secretos.
   * 7. La contraseña se descifra al vuelo mediante AES-256-GCM y nunca se expone en logs.
   */
  async revealUserPassword(targetUserId: number, actorId?: number) {
    const targetUser = await prisma.usuario.findUnique({
      where: { id: targetUserId },
      include: { rol: true, departamento: true },
    });

    if (!targetUser) {
      throw new NotFoundError(`Usuario con ID ${targetUserId} no encontrado`);
    }

    // Regla de Protección de SUPER_ADMIN:
    // La contraseña de un SUPER_ADMIN no puede ser revelada por NADIE (ni ADMIN ni otro SUPER_ADMIN).
    if (targetUser.rol.codigo === "SUPER_ADMIN") {
      throw new ForbiddenError(
        "Operación denegada: La contraseña de un Super Administrador no puede ser revelada",
      );
    }

    if (targetUser.estado !== "ACTIVO") {
      throw new NotFoundError(`Usuario con ID ${targetUserId} no encontrado o inactivo`);
    }

    // Aislamiento Departamental:
    if (actorId && actorId !== targetUser.id) {
      const scope = await scopeService.resolveUserScope(actorId);
      if (!scope.esGlobal && scope.departamentoId !== targetUser.departamentoId) {
        throw new NotFoundError(`Usuario con ID ${targetUserId} no encontrado o inactivo`);
      }
    }

    if (!targetUser.passwordEncrypted) {
      throw new BadRequestError(
        `El usuario '${targetUser.usuario}' no posee una contraseña reversible registrada`,
      );
    }

    const decryptedPassword = securityService.decryptPassword(targetUser.passwordEncrypted);

    // Auditoría transversal obligatoria (sin registrar jamás contraseñas, claves ni hashes)
    await prisma.registroAuditoria.create({
      data: {
        usuarioId: actorId ?? null,
        accion: "USUARIO_PASSWORD_REVELADO",
        entidad: "usuarios",
        entidadId: targetUserId,
        detalle: `Contraseña revelada administrativamente para usuario: ${targetUser.usuario}`,
      },
    });

    return {
      usuario: targetUser.usuario,
      password: decryptedPassword,
    };
  }

  async getCatalogs(actorId?: number) {
    let esGlobal = true;
    let actorDeptoId: number | null = null;

    if (actorId) {
      const scope = await scopeService.resolveUserScope(actorId);
      esGlobal = scope.esGlobal;
      actorDeptoId = scope.departamentoId;
    }

    const whereRoles: Record<string, unknown> = { estado: "ACTIVO" };
    // Si no es global (es ADMIN), no puede ver ni asignar el rol SUPER_ADMIN
    if (!esGlobal) {
      whereRoles.codigo = { not: "SUPER_ADMIN" };
    }

    const whereDeptos: Record<string, unknown> = { estado: "ACTIVO" };
    // Si no es global, confinado a su propio departamento
    if (!esGlobal && actorDeptoId) {
      whereDeptos.id = actorDeptoId;
    }

    const [roles, departamentos, permisos] = await Promise.all([
      prisma.rol.findMany({
        where: whereRoles,
        select: {
          id: true,
          codigo: true,
          nombre: true,
          permisos: {
            where: { estado: "ACTIVO" },
            include: {
              permiso: {
                select: { id: true, codigo: true, modulo: true, descripcion: true },
              },
            },
          },
        },
        orderBy: { id: "asc" },
      }),
      prisma.departamento.findMany({
        where: whereDeptos,
        include: {
          lineasProduccion: {
            where: { estado: "ACTIVO" },
            orderBy: { id: "asc" },
          },
        },
        orderBy: { id: "asc" },
      }),
      prisma.permiso.findMany({
        where: { estado: "ACTIVO" },
        select: {
          id: true,
          codigo: true,
          modulo: true,
          descripcion: true,
        },
        orderBy: [{ modulo: "asc" }, { codigo: "asc" }],
      }),
    ]);

    const ROLE_PRIORITY: Record<string, number> = {
      SUPER_ADMIN: 1,
      ADMIN: 2,
      REGISTRADOR: 3,
      AUDITOR: 4,
      ALMACENISTA: 5,
    };

    const rolesFormateados = roles
      .map((r) => ({
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        permisosBase: r.permisos.map((rp) => rp.permiso.codigo),
      }))
      .sort((a, b) => {
        const pA = ROLE_PRIORITY[a.codigo] ?? 99;
        const pB = ROLE_PRIORITY[b.codigo] ?? 99;
        if (pA !== pB) return pA - pB;
        return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      });

    return {
      roles: rolesFormateados,
      departamentos,
      permisos,
    };
  }
}

export const usersService = new UsersService();
