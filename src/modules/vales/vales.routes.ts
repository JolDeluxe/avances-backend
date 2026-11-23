import { Router } from "express";
import { authenticate, requireAnyPermission, requirePermission } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { PERMISOS } from "../../config/permissions";
import { valesController } from "./vales.controller";
import {
  batchOperarValesSchema,
  cancelarValeSchema,
  createValeSchema,
  descontarValeSchema,
  entregarValeSchema,
  filterValesSchema,
  retrocederValeSchema,
  separarValeSchema,
  updateValeSchema,
  valeIdParamSchema,
} from "./vales.schema";

const router = Router();

// Todas las rutas de vales requieren sesión autenticada vigente
router.use(authenticate);

// 1. Stream SSE en tiempo real
router.get(
  "/stream",
  requirePermission(PERMISOS.VALE_VER),
  (req, res, next) => valesController.streamVales(req, res, next),
);

// 2. Catálogos de Series y Departamentos Operativos
router.get(
  "/catalogos",
  requirePermission(PERMISOS.VALE_VER),
  (req, res, next) => valesController.getCatalogos(req, res, next),
);

// 3. Consulta paginada y conteos por estado/área
router.get(
  "/",
  requirePermission(PERMISOS.VALE_VER),
  validate({ query: filterValesSchema }),
  (req, res, next) => valesController.getVales(req, res, next),
);

// 4. Operación por lote Todo o Nada (All-or-Nothing)
router.post(
  "/batch-operar",
  requireAnyPermission([
    PERMISOS.VALE_SEPARAR,
    PERMISOS.VALE_ENTREGAR,
    PERMISOS.VALE_DESCONTAR,
  ]),
  validate({ body: batchOperarValesSchema }),
  (req, res, next) => valesController.batchOperarVales(req, res, next),
);

// Conteo de vales pendientes de auditoría (descuento)
router.get(
  "/auditoria/count",
  (req, res, next) => valesController.getAuditoriaCount(req, res, next),
);

// 5. Detalle de un vale con su historial completo
router.get(
  "/:id",
  requirePermission(PERMISOS.VALE_VER),
  validate({ params: valeIdParamSchema }),
  (req, res, next) => valesController.getValeById(req, res, next),
);

// 6. Registro de un nuevo vale (PENDIENTE)
router.post(
  "/",
  requirePermission(PERMISOS.VALE_CREAR),
  validate({ body: createValeSchema }),
  (req, res, next) => valesController.createVale(req, res, next),
);

// 7. Edición de un vale en estado PENDIENTE
router.put(
  "/:id",
  requirePermission(PERMISOS.VALE_EDITAR),
  validate({ params: valeIdParamSchema, body: updateValeSchema }),
  (req, res, next) => valesController.updateVale(req, res, next),
);

// 8. Separar vale (o Separar y Entregar de forma atómica si entregarTambien === true)
router.post(
  "/:id/separar",
  requirePermission(PERMISOS.VALE_SEPARAR),
  validate({ params: valeIdParamSchema, body: separarValeSchema }),
  (req, res, next) => valesController.separarVale(req, res, next),
);

// 9. Entregar vale separado a producción
router.post(
  "/:id/entregar",
  requirePermission(PERMISOS.VALE_ENTREGAR),
  validate({ params: valeIdParamSchema, body: entregarValeSchema }),
  (req, res, next) => valesController.entregarVale(req, res, next),
);

// 10. Registrar confirmación de descuento externo (DESCONTADO)
router.post(
  "/:id/descontar",
  requirePermission(PERMISOS.VALE_DESCONTAR),
  validate({ params: valeIdParamSchema, body: descontarValeSchema }),
  (req, res, next) => valesController.descontarVale(req, res, next),
);

// 11. Retroceso estricto de 1 paso inmediato (gobernado por vale:retroceder o vale:retroceder_descuento)
router.post(
  "/:id/retroceder",
  requireAnyPermission([PERMISOS.VALE_RETROCEDER, PERMISOS.VALE_RETROCEDER_DESCUENTO]),
  validate({ params: valeIdParamSchema, body: retrocederValeSchema }),
  (req, res, next) => valesController.retrocederVale(req, res, next),
);

// 12. Cancelación lógica con motivo obligatorio (solo desde PENDIENTE o SEPARADO)
router.post(
  "/:id/cancelar",
  requirePermission(PERMISOS.VALE_CANCELAR),
  validate({ params: valeIdParamSchema, body: cancelarValeSchema }),
  (req, res, next) => valesController.cancelarVale(req, res, next),
);

export const valesRouter = router;
