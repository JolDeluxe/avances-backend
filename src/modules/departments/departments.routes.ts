import { Router } from "express";
import { departmentsController } from "./departments.controller";
import { authenticate, requirePermission } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { PERMISOS } from "../../config/permissions";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  createLineSchema,
  updateLineSchema,
  reorderLineasSchema,
  departmentIdParamSchema,
  lineIdParamSchema,
} from "./departments.schema";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Departamentos
router.get(
  "/",
  requirePermission(PERMISOS.DEPARTAMENTO_VER),
  departmentsController.getDepartments.bind(departmentsController),
);

router.get(
  "/:id",
  requirePermission(PERMISOS.DEPARTAMENTO_VER),
  validate({ params: departmentIdParamSchema }),
  departmentsController.getDepartmentById.bind(departmentsController),
);

router.post(
  "/",
  requirePermission(PERMISOS.DEPARTAMENTO_ADMINISTRAR),
  validate({ body: createDepartmentSchema }),
  departmentsController.createDepartment.bind(departmentsController),
);

router.put(
  "/:id",
  requirePermission(PERMISOS.DEPARTAMENTO_ADMINISTRAR),
  validate({ params: departmentIdParamSchema, body: updateDepartmentSchema }),
  departmentsController.updateDepartment.bind(departmentsController),
);

router.delete(
  "/:id",
  requirePermission(PERMISOS.DEPARTAMENTO_ADMINISTRAR),
  validate({ params: departmentIdParamSchema }),
  departmentsController.deleteDepartment.bind(departmentsController),
);

// Reordenamiento de Líneas de Producción (debe ir antes de /lines/:lineId)
router.put(
  "/lines/reorder",
  requirePermission(PERMISOS.DEPARTAMENTO_ADMINISTRAR),
  validate({ body: reorderLineasSchema }),
  departmentsController.reorderLineas.bind(departmentsController),
);

// Líneas de Producción
router.post(
  "/:id/lines",
  requirePermission(PERMISOS.DEPARTAMENTO_ADMINISTRAR),
  validate({ params: departmentIdParamSchema, body: createLineSchema }),
  departmentsController.createLine.bind(departmentsController),
);

router.put(
  "/lines/:lineId",
  requirePermission(PERMISOS.DEPARTAMENTO_ADMINISTRAR),
  validate({ params: lineIdParamSchema, body: updateLineSchema }),
  departmentsController.updateLine.bind(departmentsController),
);

router.delete(
  "/lines/:lineId",
  requirePermission(PERMISOS.DEPARTAMENTO_ADMINISTRAR),
  validate({ params: lineIdParamSchema }),
  departmentsController.deleteLine.bind(departmentsController),
);

export const departmentsRouter = router;
