import { Router } from "express";
import { rolesController } from "./roles.controller";
import { authenticate, requirePermission } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { PERMISOS } from "../../config/permissions";
import { roleIdParamSchema, updateRolePermissionsSchema } from "./roles.schema";

const router = Router();

// Todas las rutas de roles requieren autenticación
router.use(authenticate);

// Catálogo global de permisos (antes de :id)
router.get(
  "/permisos",
  requirePermission(PERMISOS.PERMISO_VER),
  rolesController.getAllPermissions.bind(rolesController),
);

// Listar todos los roles
router.get(
  "/",
  requirePermission(PERMISOS.ROL_VER),
  rolesController.getRoles.bind(rolesController),
);

// Obtener detalle de un rol por ID
router.get(
  "/:id",
  requirePermission(PERMISOS.ROL_VER),
  validate({ params: roleIdParamSchema }),
  rolesController.getRoleById.bind(rolesController),
);

// Actualizar permisos base de un rol
router.put(
  "/:id/permisos",
  requirePermission(PERMISOS.PERMISO_ADMINISTRAR),
  validate({ params: roleIdParamSchema, body: updateRolePermissionsSchema }),
  rolesController.updateRolePermissions.bind(rolesController),
);

export const rolesRouter = router;
