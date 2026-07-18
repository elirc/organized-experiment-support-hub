/**
 * What this file does:
 * Creates the singleton Prisma client used by repositories and services.
 * What calls it:
 * Repository factories in `src/repositories/index.ts` and seed code in `prisma/seed.ts`.
 * What it calls:
 * The generated Prisma client in `src/generated/prisma/client`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Creating a new Prisma client inside every request handler, which leaks connections in development.
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __supportHubPrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__supportHubPrisma__ ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/support_hub?schema=public",
    }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__supportHubPrisma__ = prisma;
}

// ⚠️ SENIOR NOTE: Keep the singleton at module scope. If this logic moves inside a request helper,
// development hot reloads can create enough clients to exhaust the local Postgres connection pool.
