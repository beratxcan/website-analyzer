import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { loadEnvFile } from '@analyzer/config';

/**
 * Local development seed. Credentials come from environment variables
 * (`SEED_EMAIL` / `SEED_PASSWORD`, see `.env.example`) — never commit real
 * credentials. Run with `pnpm --filter @analyzer/api db:seed`.
 */
async function main(): Promise<void> {
  loadEnvFile();

  const email = process.env.SEED_EMAIL ?? 'demo@analyzer.dev';
  const password = process.env.SEED_PASSWORD ?? 'demo-password-123';

  const prisma = new PrismaClient();
  try {
    const passwordHash = await hash(password);

    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });

    const project = await prisma.project.upsert({
      where: { id: 'demo-project' },
      update: { userId: user.id },
      create: { id: 'demo-project', userId: user.id, name: 'Demo Project', description: 'Created by the development seed.' },
    });

    await prisma.website.upsert({
      where: { projectId_normalizedUrl: { projectId: project.id, normalizedUrl: 'https://example.com' } },
      update: {},
      create: {
        projectId: project.id,
        name: 'Example',
        url: 'https://example.com',
        normalizedUrl: 'https://example.com',
        host: 'example.com',
      },
    });

    console.log(`Seed complete. Demo user: ${email} (password from SEED_PASSWORD).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});