import { defineConfig } from 'prisma/config';
import { loadEnvFile } from '@analyzer/config';

/**
 * Prisma CLI configuration.
 *
 * Replaces the deprecated `package.json#prisma` block (removed in Prisma 7).
 * Migration behavior is unchanged: the schema keeps `env("DATABASE_URL")` as
 * the datasource, and `migrate deploy` / `migrate diff` keep working from the
 * generated migrations directory.
 *
 * Prisma no longer loads `.env` implicitly once a config file is present, so
 * we load the repository `.env` here (real environment variables win), which
 * keeps local `db:migrate` / `db:seed` behavior identical.
 */
loadEnvFile();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
