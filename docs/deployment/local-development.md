# Local Development

## Purpose

Get a contributor from a fresh clone to a running, testable system on their own
machine with the fewest possible steps.

## Scope

Installing dependencies, configuring the environment, starting PostgreSQL and
Redis, running the applications, and running the checks. Production packaging is
covered in [production-deployment.md](./production-deployment.md).

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Node.js ≥ 20.19 | `.nvmrc` pins the expected major version. |
| pnpm 11 | Enable via `corepack enable`; the exact version is declared by `packageManager`. |
| Docker with the Compose plugin | Used for the local PostgreSQL and Redis containers. |

## Installation

```bash
pnpm install
```

This installs every workspace package. There are no separate per-app installs.

## Environment setup

```bash
cp .env.example .env
```

The example file contains development-safe defaults and is validated centrally
by `@analyzer/config`; applications fail fast with a readable message when a
required variable is missing or invalid. **Never commit real secrets.** The
`.env` file is git-ignored, and only `.env.example` is tracked.

Key variables for local work:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection (host port 5433) | `postgres://analyzer:analyzer@localhost:5433/analyzer` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `API_PORT` | API listen port | `4000` |
| `WEB_URL` | Web origin (CORS fallback) | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | API origin the browser calls | `http://localhost:4000` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets | development placeholders |
| `AI_ENABLED`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | AI enrichment | enabled with no key (jobs fail fast) |

PostgreSQL runs on host port **5433** by default so it does not clash with a
locally installed PostgreSQL on 5432.

## Running services

Start the stateful dependencies, then the applications:

```bash
pnpm db:up     # PostgreSQL + Redis via Docker Compose
pnpm dev       # web, api and worker in watch mode
```

- Web dashboard: <http://localhost:3000>
- API health: <http://localhost:4000/health>
- API readiness: <http://localhost:4000/health/ready>
- Swagger UI: <http://localhost:4000/api/v1/docs>

Optionally seed a demo account (`demo@analyzer.dev`):

```bash
pnpm --filter @analyzer/api db:seed
```

Stop the dependencies with `pnpm db:down`.

### Working on AI enrichment without a provider

With no API key configured, AI jobs fail fast and the deterministic analysis is
unaffected. To exercise the AI path locally without a real provider, run the
bundled OpenAI-compatible stub and point the worker at it:

```bash
node infrastructure/ai-stub-server.mjs
# then start the worker with:
AI_BASE_URL=http://localhost:9999/v1 AI_API_KEY=local pnpm --filter @analyzer/worker dev
```

The stub returns grounded, schema-valid insights and must never be used in
production.

## Common commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Run web, api and worker in watch mode |
| `pnpm typecheck` | TypeScript strict typecheck across the workspace |
| `pnpm lint` | ESLint across every package |
| `pnpm test` | Vitest unit and integration tests |
| `pnpm build` | Production build for every workspace package |
| `pnpm check` | `typecheck → lint → test → build` |
| `pnpm format` | Prettier write |
| `pnpm db:up` / `pnpm db:down` / `pnpm db:logs` | Manage local PostgreSQL and Redis |
| `pnpm --filter @analyzer/api db:migrate` | Create/apply a Prisma migration |
| `pnpm --filter @analyzer/api db:seed` | Seed a demo user, project and website |

## Testing

```bash
pnpm test                                   # all packages
pnpm --filter @analyzer/api test            # API integration tests
pnpm --filter @analyzer/analysis test       # engine unit tests
```

API integration tests run against a dedicated `analyzer_test` database that is
created and migrated automatically; the development database is never touched.

## Troubleshooting

- **Port already in use.** Change `API_PORT` (and the matching web
  `NEXT_PUBLIC_API_URL`) or `POSTGRES_PORT`/`REDIS_PORT` in `.env`, then restart.
- **Configuration error on startup.** The message names the offending variable;
  it is validated on boot rather than failing later at runtime.
- **Analysis stuck in `queued`.** Confirm the worker is running and that
  `REDIS_URL` matches between the API and the worker.
- **AI result failed while the analysis succeeded.** Expected when no provider
  key is configured; the deterministic result is unaffected.

## Future considerations

- A devcontainer or Compose service for the applications themselves would remove
  the Node/pnpm prerequisite, at the cost of slower iteration.
- A single `pnpm setup` script could fold environment creation and seeding into
  one command.
