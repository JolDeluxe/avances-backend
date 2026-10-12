/**
 * Catálogo canónico de permisos del sistema.
 *
 * Este archivo es la única fuente de verdad sobre qué capacidades
 * existen en la aplicación. Toda nueva capacidad debe registrarse aquí
 * antes de ser usada en rutas, middlewares o el seed.
 *
 * Regla: El código define qué capacidades existen.
 *        La BD define su estado y asignaciones.
 *        El seed/bootstrap sincroniza el catálogo inicial.
 */

export const PERMISOS = {
  // ── Listados de material ──────────────────────────────────────────────
  LISTADO_VER: "listado:ver",
  LISTADO_CREAR: "listado:crear",
  LISTADO_EDITAR: "listado:editar",
  LISTADO_SEPARAR: "listado:separar",
  LISTADO_ENTREGAR: "listado:entregar",
  LISTADO_RETROCEDER: "listado:retroceder",
  LISTADO_CANCELAR: "listado:cancelar",
  LISTADO_DESCONTAR: "listado:descontar",

  // ── Usuarios ──────────────────────────────────────────────────────────
  USUARIO_VER: "usuario:ver",
  USUARIO_CREAR: "usuario:crear",
  USUARIO_EDITAR: "usuario:editar",
  USUARIO_ELIMINAR: "usuario:eliminar",
  USUARIO_PASSWORD_VER: "usuario:password:ver",

  // ── Departamentos y líneas de producción ──────────────────────────────
  DEPARTAMENTO_VER: "departamento:ver",
  DEPARTAMENTO_ADMINISTRAR: "departamento:administrar",

  // ── Roles ─────────────────────────────────────────────────────────────
  ROL_VER: "rol:ver",

  // ── Permisos ──────────────────────────────────────────────────────────
  PERMISO_VER: "permiso:ver",
  PERMISO_ADMINISTRAR: "permiso:administrar",

  // ── Registro del sistema (Bitácora de auditoría) ──────────────────────
  REGISTRO_SISTEMA_VER: "registro_sistema:ver",
} as const;

/** Tipo estricto: solo los valores definidos en PERMISOS son válidos. */
export type PermisoCodigo = (typeof PERMISOS)[keyof typeof PERMISOS];

/**
 * Metadata de cada permiso para sincronizar el catálogo en BD.
 * Orden: [codigo, modulo, nombre, descripcion]
 */
export const PERMISOS_METADATA: Array<{
  codigo: PermisoCodigo;
  modulo: string;
  nombre: string;
  descripcion: string;
}> = [
  {
    codigo: PERMISOS.LISTADO_VER,
    modulo: "listados",
    nombre: "Ver listados",
    descripcion: "Consultar listados de material existentes",
  },
  {
    codigo: PERMISOS.LISTADO_CREAR,
    modulo: "listados",
    nombre: "Crear listados",
    descripcion: "Crear nuevos listados de material",
  },
  {
    codigo: PERMISOS.LISTADO_EDITAR,
    modulo: "listados",
    nombre: "Editar listados",
    descripcion: "Modificar datos operativos de un listado en PENDIENTE",
  },
  {
    codigo: PERMISOS.LISTADO_SEPARAR,
    modulo: "listados",
    nombre: "Separar listados",
    descripcion: "Separar material de un listado",
  },
  {
    codigo: PERMISOS.LISTADO_ENTREGAR,
    modulo: "listados",
    nombre: "Entregar listados",
    descripcion: "Registrar entrega de material de un listado",
  },
  {
    codigo: PERMISOS.LISTADO_RETROCEDER,
    modulo: "listados",
    nombre: "Retroceder listados",
    descripcion: "Retroceder secuencialmente el estado de un listado con motivo",
  },
  {
    codigo: PERMISOS.LISTADO_CANCELAR,
    modulo: "listados",
    nombre: "Cancelar listados",
    descripcion: "Cancelar un listado operativo con justificación",
  },
  {
    codigo: PERMISOS.LISTADO_DESCONTAR,
    modulo: "listados",
    nombre: "Descontar listados",
    descripcion: "Validar y descontar un listado entregado en ERP",
  },
  {
    codigo: PERMISOS.USUARIO_VER,
    modulo: "usuarios",
    nombre: "Ver usuarios",
    descripcion: "Consultar el listado y detalle de usuarios",
  },
  {
    codigo: PERMISOS.USUARIO_CREAR,
    modulo: "usuarios",
    nombre: "Crear usuarios",
    descripcion: "Registrar nuevos usuarios en el sistema",
  },
  {
    codigo: PERMISOS.USUARIO_EDITAR,
    modulo: "usuarios",
    nombre: "Editar usuarios",
    descripcion: "Modificar datos de usuarios existentes",
  },
  {
    codigo: PERMISOS.USUARIO_ELIMINAR,
    modulo: "usuarios",
    nombre: "Desactivar usuarios",
    descripcion: "Marcar usuarios como inactivos (borrado lógico)",
  },
  {
    codigo: PERMISOS.USUARIO_PASSWORD_VER,
    modulo: "usuarios",
    nombre: "Ver contraseña de usuario",
    descripcion: "Revelar y consultar la contraseña actual de usuarios dentro de su alcance administrativo",
  },
  {
    codigo: PERMISOS.DEPARTAMENTO_VER,
    modulo: "departamentos",
    nombre: "Ver departamentos",
    descripcion: "Consultar departamentos y líneas de producción",
  },
  {
    codigo: PERMISOS.DEPARTAMENTO_ADMINISTRAR,
    modulo: "departamentos",
    nombre: "Administrar departamentos",
    descripcion: "Crear, editar y desactivar departamentos y líneas de producción",
  },
  {
    codigo: PERMISOS.ROL_VER,
    modulo: "roles",
    nombre: "Ver roles",
    descripcion: "Consultar roles y sus permisos asignados",
  },
  {
    codigo: PERMISOS.PERMISO_VER,
    modulo: "permisos",
    nombre: "Ver permisos",
    descripcion: "Consultar el catálogo de permisos del sistema",
  },
  {
    codigo: PERMISOS.PERMISO_ADMINISTRAR,
    modulo: "permisos",
    nombre: "Administrar permisos",
    descripcion: "Asignar o revocar permisos a roles y usuarios",
  },
  {
    codigo: PERMISOS.REGISTRO_SISTEMA_VER,
    modulo: "registro_sistema",
    nombre: "Ver registro del sistema",
    descripcion: "Consultar el registro de acciones realizadas en el sistema",
  },
];
