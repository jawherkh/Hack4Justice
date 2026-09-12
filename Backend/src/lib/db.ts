import { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

// Singleton Prisma client
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

/**
 * Lightweight connectivity check — used by the readiness probe.
 */
export async function checkPostgres(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  logger.debug("postgres: ok");
}
