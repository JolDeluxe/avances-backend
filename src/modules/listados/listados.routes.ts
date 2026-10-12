import { Router } from "express";
import { listadosController } from "./listados.controller";
import { authenticate, requirePermission } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { PERMISOS } from "../../config/permissions";
import {
  createListadoSchema,
  updateListadoSchema,
  listadoIdParamSchema,
  listListadosQuerySchema,
  motivoTransicionSchema,
  motivoOpcionalSchema,
  batchOperarSchema,
} from "./listados.schema";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// ─── Consulta ─────────────────────────────────────────────────────────────────

router.get(
  "/",
  requirePermission(PERMISOS.LISTADO_VER),
  validate({ query: listListadosQuerySchema }),
  (req, res, next) => listadosController.getListados(req, res, next),
);

router.get(
  "/anios",
  requirePermission(PERMISOS.LISTADO_VER),
  (req, res, next) => listadosController.getAnios(req, res, next),
);

router.get(
  "/:id",
  requirePermission(PERMISOS.LISTADO_VER),
  validate({ params: listadoIdParamSchema }),
  (req, res, next) => listadosController.getListadoById(req, res, next),
);

// ─── Creación y Edición (PENDIENTE) ──────────────────────────────────────────

router.post(
  "/",
  requirePermission(PERMISOS.LISTADO_CREAR),
  validate({ body: createListadoSchema }),
  (req, res, next) => listadosController.createListado(req, res, next),
);

router.patch(
  "/:id",
  requirePermission(PERMISOS.LISTADO_EDITAR),
  validate({ params: listadoIdParamSchema, body: updateListadoSchema }),
  (req, res, next) => listadosController.updateListado(req, res, next),
);

// ─── Transiciones de Estado Semánticas ────────────────────────────────────────

// PENDIENTE → SEPARADO
router.post(
  "/:id/separar",
  requirePermission(PERMISOS.LISTADO_SEPARAR),
  validate({ params: listadoIdParamSchema, body: motivoOpcionalSchema }),
  (req, res, next) => listadosController.separarListado(req, res, next),
);

// SEPARADO → ENTREGADO_A_PRODUCCION
router.post(
  "/:id/entregar",
  requirePermission(PERMISOS.LISTADO_ENTREGAR),
  validate({ params: listadoIdParamSchema, body: motivoOpcionalSchema }),
  (req, res, next) => listadosController.entregarListado(req, res, next),
);

// SEPARADO → PENDIENTE  |  ENTREGADO_A_PRODUCCION → SEPARADO (con motivo obligatorio)
router.post(
  "/:id/retroceder",
  requirePermission(PERMISOS.LISTADO_RETROCEDER),
  validate({ params: listadoIdParamSchema, body: motivoTransicionSchema }),
  (req, res, next) => listadosController.retrocederListado(req, res, next),
);

// PENDIENTE → CANCELADO  |  SEPARADO → CANCELADO (con motivo obligatorio)
router.post(
  "/:id/cancelar",
  requirePermission(PERMISOS.LISTADO_CANCELAR),
  validate({ params: listadoIdParamSchema, body: motivoTransicionSchema }),
  (req, res, next) => listadosController.cancelarListado(req, res, next),
);

// ENTREGADO_A_PRODUCCION → DESCONTADO (Auditoría y Descuento en ERP)
router.post(
  "/:id/descontar",
  requirePermission(PERMISOS.LISTADO_DESCONTAR),
  validate({ params: listadoIdParamSchema, body: motivoOpcionalSchema }),
  (req, res, next) => listadosController.descontarListado(req, res, next),
);

// ─── Operaciones en Lote (Batch: separar, entregar, descontar) ────────────────
router.post(
  "/batch-operar",
  validate({ body: batchOperarSchema }),
  (req, res, next) => listadosController.batchOperar(req, res, next),
);

export const listadosRouter = router;
