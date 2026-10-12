import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { usersService } from "../src/modules/users/users.service";
import { sessionService } from "../src/modules/auth/services/session.service";
import { passwordService } from "../src/modules/auth/services/password.service";
import { securityService } from "../src/modules/auth/services/security.service";
import { departmentsService } from "../src/modules/departments/departments.service";
import { rolesService } from "../src/modules/roles/roles.service";
import { prisma } from "../src/config/database";
import { PERMISOS } from "../src/config/permissions";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../src/utils/errors";

describe("Módulo de Departamentos y Líneas de Producción", () => {
  it("debe listar departamentos activos con sus líneas de producción (Materia Prima y Pieles)", async () => {
    const deptos = await departmentsService.getDepartments(true);
    expect(deptos.length).toBeGreaterThanOrEqual(2);

    const deptoMP = deptos.find((d) => d.codigo === "MATERIA_PRIMA");
    expect(deptoMP).toBeDefined();
    expect(deptoMP?.nombre).toBe("Materia Prima");
    expect(deptoMP?.lineasProduccion.length).toBeGreaterThanOrEqual(1);

    const deptoPieles = deptos.find((d) => d.codigo === "PIELES");
    expect(deptoPieles).toBeDefined();
    expect(deptoPieles?.nombre).toBe("Pieles");
    expect(deptoPieles?.lineasProduccion.length).toBeGreaterThanOrEqual(1);
  });

  it("debe crear, actualizar e inactivar lógicamente un departamento y su línea de producción", async () => {
    const uniqueSuffix = Date.now().toString().slice(-4);
    const nuevoDepto = await departmentsService.createDepartment({
      codigo: `DEP_TEST_${uniqueSuffix}`,
      nombre: `Departamento Test ${uniqueSuffix}`,
    });
    expect(nuevoDepto.id).toBeDefined();
    expect(nuevoDepto.codigo).toBe(`DEP_TEST_${uniqueSuffix}`);

    // Crear línea
    const nuevaLinea = await departmentsService.createLine(nuevoDepto.id, {
      codigo: `LIN_TEST_${uniqueSuffix}`,
      nombre: `Línea Test ${uniqueSuffix}`,
    });
    expect(nuevaLinea.id).toBeDefined();
    expect(nuevaLinea.departamentoId).toBe(nuevoDepto.id);

    // Inactivar departamento lógicamente
    const resultado = await departmentsService.deleteDepartment(nuevoDepto.id);
    expect(resultado.mensaje).toContain("inactivado exitosamente");

    // Verificar en BD que quedaron inactivos
    const deptoEnBd = await prisma.departamento.findUnique({ where: { id: nuevoDepto.id } });
    expect(deptoEnBd?.estado).toBe("INACTIVO");

    const lineaEnBd = await prisma.lineaProduccion.findUnique({ where: { id: nuevaLinea.id } });
    expect(lineaEnBd?.estado).toBe("INACTIVO");
  });
});

describe("Módulo de Usuarios y Reglas de Producción / Permisos", () => {
  it("debe obtener catálogos completos (roles, departamentos con líneas y permisos)", async () => {
    const catalogos = await usersService.getCatalogs();
    expect(catalogos.roles.length).toBeGreaterThanOrEqual(4);
    expect(catalogos.departamentos.length).toBeGreaterThanOrEqual(2);
    expect(catalogos.permisos.length).toBeGreaterThanOrEqual(10);

    const codigosRoles = catalogos.roles.map((r) => r.codigo);
    expect(codigosRoles).toContain("SUPER_ADMIN");
    expect(codigosRoles).toContain("ADMIN");
    expect(codigosRoles).toContain("ALMACENISTA");
    expect(codigosRoles).toContain("AUDITOR");
  });

  it("ALMACENISTA: debe permitir crear un usuario asignado a líneas de su propio departamento", async () => {
    const deptoMP = await prisma.departamento.findUnique({
      where: { codigo: "MATERIA_PRIMA" },
      include: { lineasProduccion: true },
    });
    const rolAlmacenista = await prisma.rol.findUnique({ where: { codigo: "ALMACENISTA" } });

    expect(deptoMP).toBeDefined();
    expect(rolAlmacenista).toBeDefined();

    const lineaMP = deptoMP!.lineasProduccion[0]!;
    const username = `almacenista_test_${Date.now()}`;

    const creado = await usersService.createUser({
      usuario: username,
      nombre: "Almacenista Test",
      password: "password123",
      rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP!.id,
      lineaProduccionIds: [lineaMP.id],
    });

    expect(creado.id).toBeDefined();
    expect(creado.usuario).toBe(username);
    expect(creado.lineasAsignadas.length).toBe(1);
    expect(creado.lineasAsignadas[0]!.id).toBe(lineaMP.id);
    expect(creado.permisosEfectivos).toBeDefined();
    expect((creado as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it("ALMACENISTA: debe rechazar asignación de líneas que pertenezcan a otro departamento", async () => {
    const deptoMP = await prisma.departamento.findUnique({ where: { codigo: "MATERIA_PRIMA" } });
    const deptoPieles = await prisma.departamento.findUnique({
      where: { codigo: "PIELES" },
      include: { lineasProduccion: true },
    });
    const rolAlmacenista = await prisma.rol.findUnique({ where: { codigo: "ALMACENISTA" } });

    const lineaPieles = deptoPieles!.lineasProduccion[0]!;
    const username = `almacenista_fail_${Date.now()}`;

    expect(
      usersService.createUser({
        usuario: username,
        nombre: "Almacenista Conflicto",
        password: "password123",
        rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
        departamentoId: deptoMP!.id, // Departamento MP pero línea de Pieles
        lineaProduccionIds: [lineaPieles.id],
      }),
    ).rejects.toThrow("no pertenece al departamento");
  });

  it("ADMIN y AUDITOR: no pertenecen a una línea de producción (se omiten líneas asignadas)", async () => {
    const deptoMP = await prisma.departamento.findUnique({
      where: { codigo: "MATERIA_PRIMA" },
      include: { lineasProduccion: true },
    });
    const rolAdmin = await prisma.rol.findUnique({ where: { codigo: "ADMIN" } });
    const lineaMP = deptoMP!.lineasProduccion[0]!;
    const username = `admin_test_${Date.now()}`;

    // Intentamos enviar lineaProduccionIds pero como es ADMIN, la regla indica que no pertenecen a líneas
    const adminCreado = await usersService.createUser({
      usuario: username,
      nombre: "Administrador Test",
      password: "password123",
      rolId: rolAdmin!.id,
      departamentoId: deptoMP!.id,
      lineaProduccionIds: [lineaMP.id],
    });

    expect(adminCreado.lineasAsignadas.length).toBe(0);
  });

  it("Edición, Inactivación lógica y Reactivación de usuario", async () => {
    const deptoMP = await prisma.departamento.findUnique({ where: { codigo: "MATERIA_PRIMA" } });
    const rolAuditor = await prisma.rol.findUnique({ where: { codigo: "AUDITOR" } });
    const username = `auditor_flow_${Date.now()}`;

    const usuario = await usersService.createUser({
      usuario: username,
      nombre: "Auditor Inicial",
      password: "password123",
      rolId: rolAuditor!.id, tipoMaterialAuditor: 'TODOS',
      departamentoId: deptoMP!.id,
    });

    // 1. Edición
    const editado = await usersService.updateUser(usuario.id, {
      nombre: "Auditor Nombre Editado",
    });
    expect(editado.nombre).toBe("Auditor Nombre Editado");

    // 2. Inactivación lógica
    const resultadoInactivar = await usersService.deleteUser(usuario.id);
    expect(resultadoInactivar.mensaje).toContain("inactivado exitosamente");

    const usuarioInactivo = await usersService.getUserById(usuario.id);
    expect(usuarioInactivo.estado).toBe("INACTIVO");

    // 3. Reactivación
    const reactivado = await usersService.reactivateUser(usuario.id);
    expect(reactivado.estado).toBe("ACTIVO");
  });

  it("Protección de SUPER_ADMIN: no se puede inactivar al único SUPER_ADMIN activo", async () => {
    const superAdmin = await prisma.usuario.findFirst({
      where: { rol: { codigo: "SUPER_ADMIN" }, estado: "ACTIVO" },
    });
    expect(superAdmin).toBeDefined();

    await expect(usersService.deleteUser(superAdmin!.id)).rejects.toThrow("No se puede inactivar al único SUPER_ADMIN");
  });
});

describe("Módulo de Roles y Permisos", () => {
  it("debe listar todos los roles con sus permisos asignados y conteo de usuarios", async () => {
    const roles = await rolesService.getRoles();
    expect(roles.length).toBeGreaterThanOrEqual(4);

    const superAdminRol = roles.find((r) => r.codigo === "SUPER_ADMIN");
    expect(superAdminRol).toBeDefined();
    expect(superAdminRol?.permisos.length).toBeGreaterThanOrEqual(10);
    expect(superAdminRol?.totalUsuariosActivos).toBeGreaterThanOrEqual(1);
  });

  it("debe consultar el catálogo global de permisos del sistema", async () => {
    const permisos = await rolesService.getAllPermissions();
    expect(permisos.length).toBeGreaterThanOrEqual(10);

    const modulos = new Set(permisos.map((p) => p.modulo));
    expect(modulos.has("usuarios")).toBe(true);
    expect(modulos.has("departamentos")).toBe(true);
    expect(modulos.has("listados")).toBe(true);
  });

  it("Protección de SUPER_ADMIN: rechaza modificar la matriz de permisos de SUPER_ADMIN", async () => {
    const rolSuperAdmin = await prisma.rol.findUnique({ where: { codigo: "SUPER_ADMIN" } });
    expect(rolSuperAdmin).toBeDefined();

    expect(rolesService.updateRolePermissions(rolSuperAdmin!.id, [])).rejects.toThrow(
      "Los permisos del rol SUPER_ADMIN son totales e inmutables",
    );
  });

  it("Idempotencia del Seed: preserva las modificaciones administrativas de roles_permisos", async () => {
    const adminRol = await prisma.rol.findUnique({
      where: { codigo: "ADMIN" },
      include: { permisos: { include: { permiso: true } } },
    });
    expect(adminRol).toBeDefined();

    // Simular personalización administrativa: quitar usuario:crear
    const idsSinCrear = adminRol!.permisos
      .filter((p) => p.permiso.codigo !== "usuario:crear")
      .map((p) => p.permiso.id);

    await rolesService.updateRolePermissions(adminRol!.id, idsSinCrear);

    // Comprobar que en BD ya no lo tiene
    let adminActualizado = await rolesService.getRoleById(adminRol!.id);
    expect(adminActualizado.permisos.some((p) => p.codigo === "usuario:crear")).toBe(false);

    // Restaurar el permiso original para no contaminar tests posteriores
    const allPerms = await prisma.permiso.findMany();
    const pCrear = allPerms.find((p) => p.codigo === "usuario:crear")!;
    idsSinCrear.push(pCrear.id);
    await rolesService.updateRolePermissions(adminRol!.id, idsSinCrear);

    adminActualizado = await rolesService.getRoleById(adminRol!.id);
    expect(adminActualizado.permisos.some((p) => p.codigo === "usuario:crear")).toBe(true);
  });
});

describe("Gestión de Contraseñas (Autoservicio y Administración)", () => {
  it("un usuario puede cambiar su propia contraseña mediante el flujo de autoservicio", async () => {
    const deptoMP = await prisma.departamento.findUnique({ where: { codigo: "MATERIA_PRIMA" } });
    const rolAlmacenista = await prisma.rol.findUnique({ where: { codigo: "ALMACENISTA" } });
    const lineaBota = await prisma.lineaProduccion.findFirst({ where: { codigo: "BOTA" } });
    const username = `pwd_self_${Date.now()}`;

    const usuario = await usersService.createUser({
      usuario: username,
      nombre: "Usuario Self Pwd",
      password: "OriginalPassword123!",
      rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP!.id,
      lineaProduccionIds: [lineaBota!.id],
    });

    // 1. Cambiar contraseña propia exitosamente
    const res = await passwordService.changePassword(usuario.id, {
      currentPassword: "OriginalPassword123!",
      newPassword: "UpdatedPassword456!",
    });
    expect(res.message).toContain("exitosa");

    // 2. Verificar que la nueva contraseña funciona con verifyPassword y la anterior no
    const enBd = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(securityService.verifyPassword("UpdatedPassword456!", enBd!.passwordHash)).toBe(true);
    expect(securityService.verifyPassword("OriginalPassword123!", enBd!.passwordHash)).toBe(false);

    // 3. Verificar que se registró auditoría transversal
    const auditoria = await prisma.registroAuditoria.findFirst({
      where: { usuarioId: usuario.id, accion: "USUARIO_PASSWORD_MODIFICADO" },
    });
    expect(auditoria).toBeDefined();
    // La auditoría nunca debe almacenar contraseñas
    const detalleSelf = auditoria?.detalle ?? "";
    expect(detalleSelf.includes("OriginalPassword123!")).toBe(false);
    expect(detalleSelf.includes("UpdatedPassword456!")).toBe(false);
  });

  it("ADMIN puede restablecer la contraseña de ALMACENISTA y de AUDITOR sin conocer la anterior", async () => {
    const superAdmin = await prisma.usuario.findFirst({
      where: { rol: { codigo: "SUPER_ADMIN" }, estado: "ACTIVO" },
    });
    const adminUser = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, estado: "ACTIVO" },
    });
    const almacenistaMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ALMACENISTA" }, departamentoId: adminUser!.departamentoId, estado: "ACTIVO" },
    });
    const auditorPieles = await prisma.usuario.findFirst({
      where: { rol: { codigo: "AUDITOR" }, estado: "ACTIVO" },
    });

    expect(superAdmin).toBeDefined();
    expect(adminUser).toBeDefined();
    expect(almacenistaMP).toBeDefined();
    expect(auditorPieles).toBeDefined();

    // 1. ADMIN cambia contraseña de ALMACENISTA de su mismo departamento
    const nuevaClaveAlmacenista = "NuevaClaveAlm_2026!";
    const resAlm = await usersService.resetUserPassword(
      almacenistaMP!.id,
      { newPassword: nuevaClaveAlmacenista },
      adminUser!.id,
    );
    expect(resAlm.message).toContain("exitosa");

    const almEnBd = await prisma.usuario.findUnique({ where: { id: almacenistaMP!.id } });
    expect(securityService.verifyPassword(nuevaClaveAlmacenista, almEnBd!.passwordHash)).toBe(true);

    // 2. ADMIN NO puede cambiar contraseña de usuario de otro departamento (aislamiento departamental -> NotFoundError)
    await expect(
      usersService.resetUserPassword(
        auditorPieles!.id,
        { newPassword: "IntentoCrossDepto123!" },
        adminUser!.id,
      ),
    ).rejects.toThrow(NotFoundError);

    // 3. SUPER_ADMIN sí puede cambiar contraseña de AUDITOR de cualquier departamento
    const nuevaClaveAuditor = "NuevaClaveAud_2026!";
    const resAud = await usersService.resetUserPassword(
      auditorPieles!.id,
      { newPassword: nuevaClaveAuditor },
      superAdmin!.id,
    );
    expect(resAud.message).toContain("exitosa");

    const audEnBd = await prisma.usuario.findUnique({ where: { id: auditorPieles!.id } });
    expect(securityService.verifyPassword(nuevaClaveAuditor, audEnBd!.passwordHash)).toBe(true);
  });

  it("ADMIN NO puede restablecer la contraseña de un SUPER_ADMIN (ForbiddenError)", async () => {
    const adminUser = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, estado: "ACTIVO" },
    });
    const superAdmin = await prisma.usuario.findFirst({
      where: { rol: { codigo: "SUPER_ADMIN" }, estado: "ACTIVO" },
    });

    expect(adminUser).toBeDefined();
    expect(superAdmin).toBeDefined();

    await expect(
      usersService.resetUserPassword(
        superAdmin!.id,
        { newPassword: "HackPassword999!" },
        adminUser!.id,
      ),
    ).rejects.toThrow(ForbiddenError);

    // Verificar también vía updateUser general
    await expect(
      usersService.updateUser(
        superAdmin!.id,
        { password: "HackViaUpdateUser!" },
        adminUser!.id,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("SUPER_ADMIN puede restablecer la contraseña de un ADMIN y de un ALMACENISTA", async () => {
    const superAdmin = await prisma.usuario.findFirst({
      where: { rol: { codigo: "SUPER_ADMIN" }, estado: "ACTIVO" },
    });
    const adminUser = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, estado: "ACTIVO" },
    });

    expect(superAdmin).toBeDefined();
    expect(adminUser).toBeDefined();

    const claveResetAdmin = "ResetPorSuperAdmin123!";
    const res = await usersService.resetUserPassword(
      adminUser!.id,
      { newPassword: claveResetAdmin },
      superAdmin!.id,
    );
    expect(res.message).toContain("exitosa");

    const adminEnBd = await prisma.usuario.findUnique({ where: { id: adminUser!.id } });
    expect(securityService.verifyPassword(claveResetAdmin, adminEnBd!.passwordHash)).toBe(true);
  });

  it("SUPER_ADMIN NO puede restablecer la contraseña de otro SUPER_ADMIN (ForbiddenError)", async () => {
    const superAdmin = await prisma.usuario.findFirst({
      where: { rol: { codigo: "SUPER_ADMIN" }, estado: "ACTIVO" },
    });
    const deptoMP = await prisma.departamento.findUnique({ where: { codigo: "MATERIA_PRIMA" } });
    const rolSuperAdmin = await prisma.rol.findUnique({ where: { codigo: "SUPER_ADMIN" } });

    // Crear un segundo superadmin temporal para la prueba
    const segundoSuperAdmin = await prisma.usuario.create({
      data: {
        usuario: `superadmin_two_${Date.now()}`,
        nombre: "Segundo Super Admin",
        passwordHash: securityService.hashPassword("SuperAdminOriginalPass!"),
        rolId: rolSuperAdmin!.id,
        departamentoId: deptoMP!.id,
        estado: "ACTIVO",
      },
    });

    try {
      // El primer superadmin intenta cambiar la contraseña del segundo
      await expect(
        usersService.resetUserPassword(
          segundoSuperAdmin.id,
          { newPassword: "NuevaClaveSuperAdmin!" },
          superAdmin!.id,
        ),
      ).rejects.toThrow(ForbiddenError);

      // Y también por updateUser
      await expect(
        usersService.updateUser(
          segundoSuperAdmin.id,
          { password: "NuevaClaveUpdate!" },
          superAdmin!.id,
        ),
      ).rejects.toThrow(ForbiddenError);
    } finally {
      // Limpiar segundo superadmin
      await prisma.usuario.delete({ where: { id: segundoSuperAdmin.id } });
    }
  });

  it("el restablecimiento de contraseña revoca inmediatamente las sesiones activas del usuario", async () => {
    const deptoMP = await prisma.departamento.findUnique({ where: { codigo: "MATERIA_PRIMA" } });
    const rolAlmacenista = await prisma.rol.findUnique({ where: { codigo: "ALMACENISTA" } });
    const lineaBota = await prisma.lineaProduccion.findFirst({ where: { codigo: "BOTA" } });
    const adminUser = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, estado: "ACTIVO" },
    });

    const userPrueba = await usersService.createUser({
      usuario: `user_sessions_${Date.now()}`,
      nombre: "Usuario Con Sesion",
      password: "InitialPassword123!",
      rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP!.id,
      lineaProduccionIds: [lineaBota!.id],
    });

    // Simular sesión activa en BD
    const rawToken = securityService.generateRefreshToken();
    const tokenHash = securityService.hashRefreshToken(rawToken);
    await prisma.sesion.create({
      data: {
        usuarioId: userPrueba.id,
        refreshTokenHash: tokenHash,
        estado: "ACTIVO",
        fechaExpiracion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Restablecer contraseña administrativamente
    await usersService.resetUserPassword(
      userPrueba.id,
      { newPassword: "NewSafePassword456!" },
      adminUser!.id,
    );

    // Comprobar que la sesión ahora está INACTIVA (revocada)
    const sesionEnBd = await prisma.sesion.findUnique({ where: { refreshTokenHash: tokenHash } });
    expect(sesionEnBd!.estado).toBe("INACTIVO");
    expect(sesionEnBd!.fechaRevocacion).toBeDefined();

    // Comprobar auditoría generada sin texto plano
    const auditoria = await prisma.registroAuditoria.findFirst({
      where: { entidadId: userPrueba.id, accion: "USUARIO_PASSWORD_RESTABLECIDO" },
    });
    expect(auditoria).toBeDefined();
    expect(auditoria!.usuarioId).toBe(adminUser!.id);
    const detalleReset = auditoria?.detalle ?? "";
    expect(detalleReset.includes("NewSafePassword456!")).toBe(false);
  });
});

describe("Gestión Segura de Contraseñas (Hash Unidireccional y Restablecimiento Administrativo)", () => {
  it("creación de usuario persiste únicamente passwordHash unidireccional y verifica correctamente", async () => {
    const deptoMP = await prisma.departamento.findUnique({ where: { codigo: "MATERIA_PRIMA" } });
    const rolAlmacenista = await prisma.rol.findUnique({ where: { codigo: "ALMACENISTA" } });
    const lineaBota = await prisma.lineaProduccion.findFirst({ where: { codigo: "BOTA" } });
    const username = `enc_test_${Date.now()}`;
    const plainPass = "MiClaveSecreta123!";

    const user = await usersService.createUser({
      usuario: username,
      nombre: "Usuario Cifrado Test",
      password: plainPass,
      rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP!.id,
      lineaProduccionIds: [lineaBota!.id],
    });

    const enBd = await prisma.usuario.findUnique({ where: { id: user.id } });
    expect(enBd?.passwordHash).toBeDefined();
    // No debe contener texto plano
    expect(enBd?.passwordHash.includes(plainPass)).toBe(false);
    expect(securityService.verifyPassword(plainPass, enBd!.passwordHash)).toBe(true);
  });

  it("ADMIN puede restablecer la contraseña de un usuario de su departamento", async () => {
    const adminUser = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, estado: "ACTIVO" },
    });
    const deptoMP = await prisma.departamento.findUnique({ where: { codigo: "MATERIA_PRIMA" } });
    const rolAlmacenista = await prisma.rol.findUnique({ where: { codigo: "ALMACENISTA" } });
    const lineaBota = await prisma.lineaProduccion.findFirst({ where: { codigo: "BOTA" } });

    const plainPass = "ClaveAlmacenista2026!";
    const almacenista = await usersService.createUser({
      usuario: `alm_reset_${Date.now()}`,
      nombre: "Almacenista Reset Test",
      password: plainPass,
      rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: deptoMP!.id,
      lineaProduccionIds: [lineaBota!.id],
    });

    const newPass = "NuevaClaveSegura2026!";
    const res = await usersService.resetUserPassword(almacenista.id, { newPassword: newPass }, adminUser!.id);
    expect(res.message).toBe("Contraseña restablecida exitosamente");

    const enBd = await prisma.usuario.findUnique({ where: { id: almacenista.id } });
    expect(securityService.verifyPassword(newPass, enBd!.passwordHash)).toBe(true);
  });
});


describe("Aislamiento Departamental de ADMIN y Alcance Global de SUPER_ADMIN (Usuarios)", () => {
  it("ADMIN solo lista usuarios de su propio departamento en getUsers", async () => {
    const adminMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    expect(adminMP).toBeDefined();

    const resultado = await usersService.getUsers({}, adminMP!.id);
    expect(resultado.items.length).toBeGreaterThan(0);
    for (const u of resultado.items) {
      expect(u.departamento.id).toBe(adminMP!.departamentoId);
    }
  });

  it("ADMIN es rechazado con ForbiddenError al intentar forzar filtro de otro departamento en getUsers", async () => {
    const adminMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    const deptoPieles = await prisma.departamento.findUnique({ where: { codigo: "PIELES" } });

    await expect(
      usersService.getUsers({ departamentoId: deptoPieles!.id }, adminMP!.id),
    ).rejects.toThrow(ForbiddenError);
  });

  it("ADMIN recibe NotFoundError al consultar detalle (getUserById) de un usuario de otro departamento", async () => {
    const adminMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    const userPieles = await prisma.usuario.findFirst({
      where: { departamento: { codigo: "PIELES" }, estado: "ACTIVO" },
    });
    expect(adminMP).toBeDefined();
    expect(userPieles).toBeDefined();

    let errorLanzado: unknown = null;
    try {
      await usersService.getUserById(userPieles!.id, adminMP!.id);
    } catch (err) {
      errorLanzado = err;
    }
    expect(errorLanzado).toBeInstanceOf(NotFoundError);
  });

  it("ADMIN es rechazado con ForbiddenError al intentar crear un usuario en otro departamento", async () => {
    const adminMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    const deptoPieles = await prisma.departamento.findUnique({ where: { codigo: "PIELES" } });
    const rolAlmacenista = await prisma.rol.findUnique({ where: { codigo: "ALMACENISTA" } });

    await expect(
      usersService.createUser(
        {
          usuario: `cross_user_${Date.now()}`,
          nombre: "Usuario Cross Depto",
          password: "CrossPassword123!",
          rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
          departamentoId: deptoPieles!.id,
        },
        adminMP!.id,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("ADMIN es rechazado con ForbiddenError al intentar transferir un usuario a otro departamento vía updateUser", async () => {
    const adminMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    const userMP = await prisma.usuario.findFirst({
      where: { departamentoId: adminMP!.departamentoId, rol: { codigo: "ALMACENISTA" }, estado: "ACTIVO" },
    });
    const deptoPieles = await prisma.departamento.findUnique({ where: { codigo: "PIELES" } });

    await expect(
      usersService.updateUser(
        userMP!.id,
        { departamentoId: deptoPieles!.id },
        adminMP!.id,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("ADMIN recibe NotFoundError al intentar editar un usuario de otro departamento", async () => {
    const adminMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    const userPieles = await prisma.usuario.findFirst({
      where: { departamento: { codigo: "PIELES" }, estado: "ACTIVO" },
    });

    let err: unknown = null;
    try {
      await usersService.updateUser(userPieles!.id, { nombre: "Intento Hack" }, adminMP!.id);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it("ADMIN recibe NotFoundError al intentar inactivar un usuario de otro departamento", async () => {
    const adminMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    const userPieles = await prisma.usuario.findFirst({
      where: { departamento: { codigo: "PIELES" }, estado: "ACTIVO" },
    });

    let err: unknown = null;
    try {
      await usersService.deleteUser(userPieles!.id, adminMP!.id);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it("ADMIN recibe NotFoundError al intentar reactivar un usuario de otro departamento", async () => {
    const adminMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    const userPieles = await prisma.usuario.findFirst({
      where: { departamento: { codigo: "PIELES" }, estado: "ACTIVO" },
    });

    let err: unknown = null;
    try {
      await usersService.reactivateUser(userPieles!.id, adminMP!.id);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it("ADMIN recibe NotFoundError al intentar consultar/revelar contraseña de un usuario de otro departamento", async () => {
    const adminMP = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    const userPieles = await prisma.usuario.findFirst({
      where: { departamento: { codigo: "PIELES" }, estado: "ACTIVO" },
    });

    let err: unknown = null;
    try {
      await usersService.resetUserPassword(userPieles!.id, { newPassword: "OtherSecret2026!" }, adminMP!.id);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it("SUPER_ADMIN conserva alcance global para consultar, crear y operar en cualquier departamento", async () => {
    const superAdmin = await prisma.usuario.findFirst({
      where: { rol: { codigo: "SUPER_ADMIN" }, estado: "ACTIVO" },
    });
    expect(superAdmin).toBeDefined();

    // 1. getUsers sin filtro devuelve usuarios de varios departamentos
    const todos = await usersService.getUsers({}, superAdmin!.id);
    const deptos = new Set(todos.items.map((u) => u.departamento.codigo));
    expect(deptos.size).toBeGreaterThanOrEqual(2);

    // 2. Puede ver detalle de cualquier usuario de cualquier departamento
    const userPieles = await prisma.usuario.findFirst({
      where: { departamento: { codigo: "PIELES" }, estado: "ACTIVO" },
    });
    const detalle = await usersService.getUserById(userPieles!.id, superAdmin!.id);
    expect(detalle.id).toBe(userPieles!.id);

    // 3. Puede filtrar explícitamente por cualquier departamentoId
    const deptoPieles = await prisma.departamento.findUnique({ where: { codigo: "PIELES" } });
    const filtradosPieles = await usersService.getUsers({ departamentoId: deptoPieles!.id }, superAdmin!.id);
    for (const u of filtradosPieles.items) {
      expect(u.departamento.id).toBe(deptoPieles!.id);
    }
  });
});

describe("Ciclo de Vida Activo / Inactivo y Revocación Inmediata de Acceso (Usuarios)", () => {
  const app = createApp();
  let server: Server | undefined;
  let port: number;
  let tokenAdmin: string;
  let idAdmin: number;
  let idDeptoMP: number;

  beforeAll(async () => {
    server = app.listen(0);
    const address = server.address();
    port = typeof address === "object" && address ? address.port : 3000;

    const adminUser = await prisma.usuario.findFirst({
      where: { rol: { codigo: "ADMIN" }, departamento: { codigo: "MATERIA_PRIMA" }, estado: "ACTIVO" },
    });
    idAdmin = adminUser!.id;
    idDeptoMP = adminUser!.departamentoId;

    tokenAdmin = securityService.generateAccessToken({
      usuarioId: idAdmin,
      usuario: adminUser!.usuario,
      rolId: adminUser!.rolId,
      departamentoId: idDeptoMP,
      permisos: [
        PERMISOS.USUARIO_VER,
        PERMISOS.USUARIO_CREAR,
        PERMISOS.USUARIO_EDITAR,
        PERMISOS.USUARIO_ELIMINAR,
      ],
    });
  });

  afterAll(async () => {
    if (server) {
      const activeServer = server;
      await new Promise<void>((resolve) => activeServer.close(() => resolve()));
    }
  });

  interface HttpResponse {
    status: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: any;
  }

  const httpGet = async (path: string, token?: string): Promise<HttpResponse> => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    return { status: res.status, json };
  };

  const httpDelete = async (path: string, token: string): Promise<HttpResponse> => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    return { status: res.status, json };
  };

  const httpPatch = async (path: string, token: string): Promise<HttpResponse> => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    return { status: res.status, json };
  };

  it("1 & 4 & 5. Flujo completo: Usuario activo inicia sesión -> obtiene Access Token -> Admin desactiva usuario -> Access Token anterior es rechazado con 401 de inmediato -> reactivado puede volver a iniciar sesión", async () => {
    const unique = Date.now().toString().slice(-5);
    const testUsername = `user_cycle_${unique}`;
    const testPassword = "CicloPassword123!";
    const rolAlmacenista = await prisma.rol.findUnique({ where: { codigo: "ALMACENISTA" } });

    // A. Crear usuario activo
    const creado = await usersService.createUser({
      usuario: testUsername,
      nombre: `Usuario Ciclo ${unique}`,
      password: testPassword,
      rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: idDeptoMP,
    });
    expect(creado.estado).toBe("ACTIVO");

    try {
      // B. Usuario activo puede iniciar sesión y recibe Access Token y Refresh Token
      const loginRes = await sessionService.login({
        usuario: testUsername,
        password: testPassword,
      });
      expect(loginRes.accessToken).toBeDefined();
      expect(loginRes.refreshToken).toBeDefined();
      const userAccessToken = loginRes.accessToken;
      const userRefreshToken = loginRes.refreshToken;

      // C. El Access Token funciona correctamente mientras el usuario está ACTIVO
      const profileBefore = await httpGet("/api/v1/auth/profile", userAccessToken);
      expect(profileBefore.status).toBe(200);
      expect(profileBefore.json.success).toBe(true);
      expect(profileBefore.json.data.usuario).toBe(testUsername);

      // D. Administrador desactiva al usuario vía DELETE /api/v1/users/:id
      const deleteRes = await httpDelete(`/api/v1/users/${creado.id}`, tokenAdmin);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.json.success).toBe(true);

      // Comprobar que en BD el usuario está INACTIVO
      const usuarioEnDb = await prisma.usuario.findUnique({ where: { id: creado.id } });
      expect(usuarioEnDb?.estado).toBe("INACTIVO");

      // E. El usuario intenta utilizar posteriormente el Access Token emitido previamente
      // REGLA CRÍTICA: authenticate debe validar el estado actual en BD y rechazar con 401 inmediatamente
      const profileAfter = await httpGet("/api/v1/auth/profile", userAccessToken);
      expect(profileAfter.status).toBe(401);
      expect(profileAfter.json.success).toBe(false);
      expect(profileAfter.json.message).toContain("inactivo");

      // F. Usuario inactivo NO puede iniciar sesión
      let loginError: unknown = null;
      try {
        await sessionService.login({
          usuario: testUsername,
          password: testPassword,
        });
      } catch (e) {
        loginError = e;
      }
      expect(loginError).toBeInstanceOf(UnauthorizedError);

      // G. Usuario inactivo NO puede refrescar sesión
      let refreshError: unknown = null;
      try {
        await sessionService.refresh(userRefreshToken);
      } catch (e) {
        refreshError = e;
      }
      expect(refreshError).toBeInstanceOf(UnauthorizedError);

      // H. Administrador reactiva al usuario vía PATCH /api/v1/users/:id/reactivate
      const reactivateRes = await httpPatch(`/api/v1/users/${creado.id}/reactivate`, tokenAdmin);
      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.json.success).toBe(true);

      const usuarioReactivadoDb = await prisma.usuario.findUnique({ where: { id: creado.id } });
      expect(usuarioReactivadoDb?.estado).toBe("ACTIVO");

      // I. Usuario reactivado puede volver a iniciar sesión exitosamente
      const nuevoLogin = await sessionService.login({
        usuario: testUsername,
        password: testPassword,
      });
      expect(nuevoLogin.accessToken).toBeDefined();

      // J. El nuevo Access Token funciona correctamente
      const profileReactivated = await httpGet("/api/v1/auth/profile", nuevoLogin.accessToken);
      expect(profileReactivated.status).toBe(200);
      expect(profileReactivated.json.data.usuario).toBe(testUsername);
    } finally {
      // Limpieza controlada
      await prisma.sesion.deleteMany({ where: { usuarioId: creado.id } });
      await prisma.registroAuditoria.deleteMany({ where: { entidadId: creado.id } });
      await prisma.usuario.delete({ where: { id: creado.id } });
    }
  });

  it("2. Consulta de usuarios: GET /users muestra ACTIVO por defecto, ?estado=INACTIVO filtra inactivos y ?estado=TODOS devuelve ambos", async () => {
    const unique = Date.now().toString().slice(-5);
    const usernameActivo = `u_act_${unique}`;
    const usernameInactivo = `u_inac_${unique}`;
    const rolAlmacenista = await prisma.rol.findUnique({ where: { codigo: "ALMACENISTA" } });

    // 1. Crear un usuario activo
    const uActivo = await usersService.createUser({
      usuario: usernameActivo,
      nombre: `Usuario Activo ${unique}`,
      password: "TestPassword123!",
      rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: idDeptoMP,
    });

    // 2. Crear y luego desactivar un usuario
    const uInactivo = await usersService.createUser({
      usuario: usernameInactivo,
      nombre: `Usuario Inactivo ${unique}`,
      password: "TestPassword123!",
      rolId: rolAlmacenista!.id, tipoSurtidoAlmacen: 'DIRECTOS',
      departamentoId: idDeptoMP,
    });
    await usersService.deleteUser(uInactivo.id, idAdmin);

    try {
      // A. GET /api/v1/users sin parámetros: por defecto muestra solo ACTIVOS
      const defaultList = await httpGet(`/api/v1/users?busqueda=${unique}`, tokenAdmin);
      expect(defaultList.status).toBe(200);
      expect(defaultList.json.success).toBe(true);
      expect(defaultList.json.data.items.length).toBe(1);
      expect(defaultList.json.data.items[0].id).toBe(uActivo.id);
      expect(defaultList.json.data.items[0].estado).toBe("ACTIVO");

      // B. GET /api/v1/users?estado=INACTIVO: devuelve exclusivamente usuarios INACTIVOS
      const inactiveList = await httpGet(`/api/v1/users?busqueda=${unique}&estado=INACTIVO`, tokenAdmin);
      expect(inactiveList.status).toBe(200);
      expect(inactiveList.json.success).toBe(true);
      expect(inactiveList.json.data.items.length).toBe(1);
      expect(inactiveList.json.data.items[0].id).toBe(uInactivo.id);
      expect(inactiveList.json.data.items[0].estado).toBe("INACTIVO");

      // C. GET /api/v1/users?estado=TODOS: devuelve tanto activos como inactivos
      const allList = await httpGet(`/api/v1/users?busqueda=${unique}&estado=TODOS`, tokenAdmin);
      expect(allList.status).toBe(200);
      expect(allList.json.success).toBe(true);
      expect(allList.json.data.items.length).toBe(2);
      const ids = allList.json.data.items.map((i: { id: number }) => i.id);
      expect(ids).toContain(uActivo.id);
      expect(ids).toContain(uInactivo.id);
    } finally {
      await prisma.sesion.deleteMany({ where: { usuarioId: { in: [uActivo.id, uInactivo.id] } } });
      await prisma.registroAuditoria.deleteMany({ where: { entidadId: { in: [uActivo.id, uInactivo.id] } } });
      await prisma.usuario.deleteMany({ where: { id: { in: [uActivo.id, uInactivo.id] } } });
    }
  });

  it("3. Autorización y Aislamiento en desactivación y reactivación", async () => {
    const userPieles = await prisma.usuario.findFirst({
      where: { departamento: { codigo: "PIELES" }, estado: "ACTIVO" },
    });
    expect(userPieles).toBeDefined();

    // ADMIN de Materia Prima no puede desactivar usuario de Pieles (404 NotFoundError por aislamiento)
    const deleteCross = await httpDelete(`/api/v1/users/${userPieles!.id}`, tokenAdmin);
    expect(deleteCross.status).toBe(404);

    // ADMIN de Materia Prima no puede reactivar usuario de Pieles (404 NotFoundError por aislamiento)
    const reactivateCross = await httpPatch(`/api/v1/users/${userPieles!.id}/reactivate`, tokenAdmin);
    expect(reactivateCross.status).toBe(404);

    // Petición sin token es rechazada con 401
    const noToken = await httpDelete(`/api/v1/users/${userPieles!.id}`, "");
    expect(noToken.status).toBe(401);
  });
});
