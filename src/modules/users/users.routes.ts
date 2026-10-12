import { Router } from "express";
import { usersController } from "./users.controller";
import { authenticate, requirePermission } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { PERMISOS } from "../../config/permissions";
import {
  createUserSchema,
  updateUserSchema,
  filterUsersSchema,
  userIdParamSchema,
  resetPasswordSchema,
} from "./users.schema";

const router = Router();

// Todas las rutas de usuarios requieren autenticación
router.use(authenticate);

// Catálogos (roles, departamentos con líneas, permisos) para formularios
router.get(
  "/catalogs",
  requirePermission(PERMISOS.USUARIO_VER),
  usersController.getCatalogs.bind(usersController),
);

// Listar usuarios con filtros y paginación
router.get(
  "/",
  requirePermission(PERMISOS.USUARIO_VER),
  validate({ query: filterUsersSchema }),
  usersController.getUsers.bind(usersController),
);

// Obtener detalle de usuario por ID
router.get(
  "/:id",
  requirePermission(PERMISOS.USUARIO_VER),
  validate({ params: userIdParamSchema }),
  usersController.getUserById.bind(usersController),
);

// Crear nuevo usuario
router.post(
  "/",
  requirePermission(PERMISOS.USUARIO_CREAR),
  validate({ body: createUserSchema }),
  usersController.createUser.bind(usersController),
);

// Actualizar usuario
router.put(
  "/:id",
  requirePermission(PERMISOS.USUARIO_EDITAR),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  usersController.updateUser.bind(usersController),
);

// Inactivar / "Eliminar" usuario (borrado lógico)
router.delete(
  "/:id",
  requirePermission(PERMISOS.USUARIO_ELIMINAR),
  validate({ params: userIdParamSchema }),
  usersController.deleteUser.bind(usersController),
);

// Reactivar usuario
router.patch(
  "/:id/reactivate",
  requirePermission(PERMISOS.USUARIO_EDITAR),
  validate({ params: userIdParamSchema }),
  usersController.reactivateUser.bind(usersController),
);

// Restablecer contraseña de usuario (gestión administrativa)
router.post(
  "/:id/reset-password",
  requirePermission(PERMISOS.USUARIO_EDITAR),
  validate({ params: userIdParamSchema, body: resetPasswordSchema }),
  usersController.resetPassword.bind(usersController),
);

// Revelar contraseña actual de usuario (gestión administrativa)
router.get(
  "/:id/revealed-password",
  requirePermission(PERMISOS.USUARIO_PASSWORD_VER),
  validate({ params: userIdParamSchema }),
  usersController.getRevealedPassword.bind(usersController),
);

export const usersRouter = router;
