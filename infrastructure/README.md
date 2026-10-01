# Infrastructure (Local Development)

Docker Compose setup for the local development dependencies.

| Service    | Image                | Host port (default) | Container port | Persistence      |
| ---------- | -------------------- | ------------------- | -------------- | ---------------- |
| PostgreSQL | `postgres:16-alpine` | `5433`              | `5432`         | `postgres_data`  |
| Redis      | `redis:7-alpine`     | `6379`              | `6379`         | `redis_data`     |

The PostgreSQL host port defaults to `5433` to avoid clashing with a locally
installed PostgreSQL on `5432`; override via `POSTGRES_PORT` if desired.

## Usage

From the repository root (requires a `.env` file — `cp .env.example .env` first):

```bash
pnpm db:up      # start PostgreSQL and Redis
pnpm db:down    # stop the containers
pnpm db:logs    # follow container logs
```

Ports, credentials and volume data are configured through environment
variables (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
`POSTGRES_PORT`, `REDIS_PORT`) — see `.env.example`. The defaults match the
development `DATABASE_URL` / `REDIS_URL` values.

Both services run healthchecks; `docker compose ps` shows their status.

> Note: `pnpm db:down` keeps the named volumes. To wipe local data run
> `docker compose -f infrastructure/docker-compose.yml --env-file .env down -v`.