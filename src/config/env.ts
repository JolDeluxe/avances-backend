import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVER_HOST: z.string().default("127.0.0.1"),
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((val) => val === "true" || val === "1"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((val) => (val.includes(",") ? val.split(",").map((s) => s.trim()) : [val.trim()])),

  // Políticas de Sesión y Tokens
  SESSION_DURATION_DAYS: z.coerce.number().default(30),
  ACCESS_TOKEN_EXPIRES_MINUTES: z.coerce.number().default(15),
  SESSION_REFRESH_INTERVAL_HOURS: z.coerce.number().default(24),

  // Configuración de Cookies
  SESSION_COOKIE_NAME: z.string().default("mp_session"),
  SESSION_COOKIE_HTTP_ONLY: z
    .string()
    .default("true")
    .transform((val) => val === "true" || val === "1"),
  SESSION_COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((val) => val === "true" || val === "1"),
  SESSION_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),

  // Rate Limiting General (Permisivo para uso operacional continuo de usuarios en planta)
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutos
  RATE_LIMIT_MAX: z.coerce.number().default(10000), // 10,000 peticiones por ventana de 15 min (aprox 660 req/min)

  // Clave secreta para firma de Access Tokens (JWT)
  JWT_SECRET: z.string().default("materia_prima_jwt_secret_key_2026_super_secure_random_string_32_chars"),

  // Clave secreta para cifrado reversible de contraseñas administrativas (AES-256-GCM)
  // Debe ser una clave segura de al menos 32 caracteres (256 bits).
  // En producción es estrictamente obligatoria desde variable de entorno.
  PASSWORD_ENCRYPTION_KEY: z
    .string()
    .min(32, "PASSWORD_ENCRYPTION_KEY debe tener al menos 32 caracteres")
    .default(
      process.env.NODE_ENV === "production"
        ? (undefined as unknown as string)
        : "dev_secure_encryption_key_32_bytes_materia_prima_aes_gcm!!",
    ),
});

export { envSchema };

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Variables de entorno inválidas o faltantes:");
  console.error(parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
