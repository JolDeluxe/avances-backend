import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { logger } from "../utils/logger";
import { env } from "../config/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const normalizeMariaDbUrl = (url: string): string => {
  let normalized = url.replace(/^mysql:\/\//i, "mariadb://");
  if (!normalized.includes("allowPublicKeyRetrieval")) {
    normalized += (normalized.includes("?") ? "&" : "?") + "allowPublicKeyRetrieval=true";
  }
  return normalized;
};

const createPrismaClient = (): PrismaClient => {
  // Prisma 7 requiere pasar el adapter al constructor de PrismaClient
  const adapter = new PrismaMariaDb(normalizeMariaDbUrl(env.DATABASE_URL));

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "error" },
            { emit: "stdout", level: "warn" },
          ]
        : [{ emit: "stdout", level: "error" }],
  });
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV === "development") {
  // @ts-expect-error Prisma event typing for query log
  prisma.$on("query", (e: { query: string; duration: number }) => {
    logger.debug({ query: e.query, duration: `${e.duration}ms` }, "Prisma Query");
  });
}

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
