import { Router } from "express";
import { sessionController } from "./controllers/session.controller";
import { passwordController } from "./controllers/password.controller";
import { profileController } from "./controllers/profile.controller";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { loginSchema, changePasswordSchema, updateProfileSchema } from "./auth.schema";

const router = Router();

// Rutas de Sesión
router.post(
  "/login",
  validate({ body: loginSchema }),
  (req, res, next) => sessionController.login(req, res, next),
);

router.post(
  "/refresh",
  (req, res, next) => sessionController.refresh(req, res, next),
);

router.post(
  "/logout",
  (req, res, next) => sessionController.logout(req, res, next),
);

// Lista pública de usuarios activos para el selector de Login
router.get(
  "/usuarios",
  (req, res, next) => sessionController.getUsuariosLogin(req, res, next),
);

// Rutas de Contraseñas
router.post(
  "/change-password",
  authenticate,
  validate({ body: changePasswordSchema }),
  (req, res, next) => passwordController.changePassword(req, res, next),
);

// Rutas de Perfil
router.get(
  "/profile",
  authenticate,
  (req, res, next) => profileController.getProfile(req, res, next),
);

router.get(
  "/me",
  authenticate,
  (req, res, next) => profileController.getProfile(req, res, next),
);

router.patch(
  "/profile",
  authenticate,
  validate({ body: updateProfileSchema }),
  (req, res, next) => profileController.updateProfile(req, res, next),
);

export const authRouter = router;
