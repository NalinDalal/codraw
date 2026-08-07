import { PrismaClient } from "./.generated/client";

/**
 * Singleton Prisma client instance used across all backend services for database access.
 *
 * Provides a shared connection pool to the underlying database, avoiding the overhead
 * of creating multiple clients. Use this instance for all Prisma queries and mutations.
 *
 * @example
 * ```ts
 * import { prismaClient } from "@repo/db";
 *
 * const users = await prismaClient.user.findMany();
 * ```
 */
export const prismaClient = new PrismaClient();
