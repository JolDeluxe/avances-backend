import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { env } from "../config/env";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err }, "Error no operacional detectado");
    }
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors !== undefined && { errors: err.errors }),
    });
    return;
  }

  // Error inesperado o de sistema
  logger.error({ err }, "Error no controlado / inesperado");

  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
    ...(env.NODE_ENV !== "production" && {
      stack: err.stack,
      errorDetail: err.message,
    }),
  });
};
