# Backend - Materia Prima

Base de arquitectura backend profesional, limpia, modular y segura construida sobre **Bun**, **Express**, **TypeScript**, **Prisma ORM** y **MySQL**.

## Arquitectura

Flujo estricto sin sobreingeniería: **Ruta ➔ Controlador ➔ Servicio ➔ Prisma**

```text
backend/
├── prisma/
│   └── schema.prisma           # Datasource MySQL y modelo base User
├── src/
│   ├── config/
│   │   ├── env.ts              # Variables de entorno validadas con Zod
│   │   └── database.ts         # Singleton de Prisma Client con logging
│   ├── middlewares/
│   │   ├── errorHandler.ts     # Manejo global centralizado de errores
│   │   ├── rateLimiter.ts      # Rate limiter configurado con RFC standard headers
│   │   └── validate.ts         # Middleware para esquemas Zod (body, query, params)
│   ├── modules/
│   │   └── auth/               # Módulo de Autenticación desacoplado
│   │       ├── auth.routes.ts
│   │       ├── auth.schema.ts
│   │       ├── controllers/    # Subdividido semánticamente (máx 10-15 líneas)
│   │       │   ├── session.controller.ts
│   │       │   ├── password.controller.ts
│   │       │   └── profile.controller.ts
│   │       └── services/       # Lógica y llamadas a Prisma
│   │           ├── session.service.ts
│   │           ├── password.service.ts
│   │           └── profile.service.ts
│   ├── routes/
│   │   └── index.ts            # Enrutador base versionado (/api/v1)
│   ├── utils/
│   │   ├── errors.ts           # Clases AppError, NotFoundError, etc.
│   │   ├── logger.ts           # Pino structured logger
│   │   └── response.ts         # Funciones helper estandarizadas de respuesta
│   ├── app.ts                  # Configuración de Express, seguridad y middlewares
│   └── index.ts                # Bootstrap del servidor y graceful shutdown
├── test/
│   └── health.test.ts          # Pruebas automatizadas de salud con bun:test
├── .env.example
├── bunfig.toml
├── eslint.config.js
├── package.json
└── tsconfig.json
```

## Scripts Disponibles

Todos los comandos deben ejecutarse con **Bun**:

```bash
# Desarrollo con recarga automática
bun run dev

# Ejecución en producción
bun run start

# Verificación estricta de tipos
bun run typecheck

# Linter (ESLint)
bun run lint
bun run lint:fix

# Pruebas unitarias/integración
bun run test

# Prisma
bun run prisma:generate
bun run prisma:migrate
```
