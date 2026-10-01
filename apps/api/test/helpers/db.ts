import type { PrismaClient } from '@prisma/client';

/** Truncates all tables so each suite starts from a clean state. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
}