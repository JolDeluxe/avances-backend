import rateLimit from "express-rate-limit";
import { env } from "../config/env";

/**
 * Limitador de tasa global amplio para permitir uso concurrente e intensivo en planta
 * por múltiples operadores compartiendo red, navegación activa y recargas frecuentes.
 */
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX, // 10,000 peticiones por ventana de 15 min
  standardHeaders: true, // Cabeceras estándar RFC (`RateLimit-*`)
  legacyHeaders: false,
  message: {
    success: false,
    message: "Demasiadas peticiones desde esta IP, por favor inténtalo más tarde.",
  },
  // No bloquear llamadas de health check, entorno de test ni desarrollo local
  skip: (req) => req.path === "/health" || env.NODE_ENV === "test" || env.NODE_ENV === "development",
});
