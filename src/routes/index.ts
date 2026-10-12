import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes";
import { usersRouter } from "../modules/users/users.routes";
import { departmentsRouter } from "../modules/departments/departments.routes";
import { rolesRouter } from "../modules/roles/roles.routes";
import { listadosRouter } from "../modules/listados/listados.routes";

const router = Router();

// Montaje de módulos de dominio
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/departments", departmentsRouter);
router.use("/roles", rolesRouter);
router.use("/listados", listadosRouter);

export const v1Router = router;

