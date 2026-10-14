import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { globalRateLimiter } from "./middlewares/rateLimiter";
import { errorHandler } from "./middlewares/errorHandler";
import { v1Router } from "./routes";
import { sendSuccess } from "./utils/response";
import { NotFoundError } from "./utils/errors";

export const createApp = (): Express => {
  const app = express();

  // 1. Configuración de Trust Proxy para entornos reales (detrás de reverse proxies/balancers)
  if (env.TRUST_PROXY) {
    app.set("trust proxy", 1);
  }

  // 2. Middlewares de seguridad y optimización de transporte
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );
  app.use(
    compression({
      filter: (req, res) => {
        // No comprimir streams de eventos SSE para evitar retención en búfer
        if (req.path.endsWith("/stream") || req.headers.accept === "text/event-stream") {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  // 3. Parser de cookies ligero y sin dependencias externas
  app.use((req, _res, next) => {
    const cookieHeader = req.headers.cookie;
    const cookies: Record<string, string> = {};
    if (cookieHeader) {
      const pairs = cookieHeader.split(";");
      for (const pair of pairs) {
        const idx = pair.indexOf("=");
        if (idx > 0) {
          const key = pair.substring(0, idx).trim();
          const val = decodeURIComponent(pair.substring(idx + 1).trim());
          cookies[key] = val;
        }
      }
    }
    (req as unknown as { cookies: Record<string, string> }).cookies = cookies;
    next();
  });

  // 4. Rate limiting global
  app.use(globalRateLimiter);

  // 5. Logging HTTP estructurado
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === "/health",
      },
    }),
  );

  // 6. Parsers de contenido
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // 6. Endpoint de Health Check
  app.get("/health", (_req, res) => {
    sendSuccess(res, {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // 7. Rutas versionadas de la API
  app.use("/api/v1", v1Router);

  // 8. Manejo de rutas inexistentes (404)
  app.use((_req, _res, next) => {
    next(new NotFoundError("Ruta no encontrada"));
  });

  // 9. Manejador global centralizado de errores
  app.use(errorHandler);

  return app;
};
