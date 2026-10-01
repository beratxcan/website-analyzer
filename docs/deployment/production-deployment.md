# Production Deployment

## Purpose

Describe how to deploy the system in a production-shaped way: what artifacts are
built, what must be configured, how schema migrations are applied, and what to
watch once it is running. The guidance is intentionally vendor-neutral.

## Scope

Containerized deployment of the three applications plus PostgreSQL and Redis,
required configuration, the migration flow, and monitoring considerations. Local
setup is covered in [local-development.md](./local-development.md).

## Deployment architecture

```text
                    ┌─────────────┐
   Browser  ───►    │  Web (SSR)  │  ───►  API  ───►  PostgreSQL
                    └─────────────┘          │
                                              ├──►  Redis  ◄── Worker
                                              │
                                     AI provider (outbound)
```

- **Web** runs the Next.js server. Point it at the public API origin via
  `NEXT_PUBLIC_API_URL` at build time.
- **API** serves the REST surface and the liveness/readiness probes. It expects a
  TLS-terminating proxy in front of it, so terminate TLS at the edge and let the
  API enable HSTS and trust one proxy hop.
- **Worker** consumes both queues. It exposes no port; its readiness is asserted
  at startup by pinging Redis and running a `SELECT 1` against PostgreSQL.
- **PostgreSQL** and **Redis** are the only stateful services. Keep them private
  to the deployment network — they should publish no host ports.

Each application has a multi-stage Dockerfile that builds from the repository
root (so the pnpm workspace manifests resolve), installs production dependencies
only, and runs as the unprivileged `node` user. The web image ships Next.js
standalone output. No secrets are baked into any image and no `.env` file is
copied into one.

## Environment variables

Configuration is grouped by concern and validated at startup by
`@analyzer/config`; a process fails fast and names any missing or invalid
variable rather than failing later.

| Group | Variables | Notes |
| --- | --- | --- |
| App | `NODE_ENV`, `API_PORT`, `WEB_URL` | `NODE_ENV=production` enables production behavior. |
| Database | `DATABASE_URL`, `POSTGRES_*` | Required; no secret defaults. |
| Redis | `REDIS_URL` | Required. |
| Auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL` | In production the API refuses to start with development defaults or secrets shorter than 32 characters. |
| Security | `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, `HSTS_ENABLED`, `SWAGGER_ENABLED`, `THROTTLE_*`, `RATE_LIMIT_REDIS_FAILURE`, `RATE_LIMIT_KEY_PREFIX` | Origins are explicit — never a wildcard. The auth throttle always fails closed. |
| Analysis | `ANALYSIS_JOB_ATTEMPTS`, `ANALYSIS_JOB_BACKOFF_DELAY_MS` | Retry policy for queued runs. |
| Queue / worker | `WORKER_CONCURRENCY`, `AI_CONCURRENCY`, `WORKER_STALE_RUN_THRESHOLD_MS`, `WORKER_STALE_CHECK_INTERVAL_MS` | Tune per host capacity. |
| Fetch | `FETCH_CONNECTION_TIMEOUT_MS`, `FETCH_TOTAL_TIMEOUT_MS`, `FETCH_MAX_REDIRECTS`, `FETCH_MAX_RESPONSE_BYTES` | SSRF-safe fetch limits; keep the defaults unless there is a reason. |
| AI | `AI_ENABLED`, `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_FINDINGS`, `AI_MAX_RECOMMENDATIONS`, `AI_MAX_REPAIRS`, `AI_JOB_ATTEMPTS`, `AI_JOB_BACKOFF_DELAY_MS` | `AI_API_KEY` is required in production when AI is enabled. |
| Logging | `LOG_LEVEL` | `debug` / `info` / `warn` / `error`. |

Never commit real values. Provide secrets through the deployment's secret
mechanism (environment injection or a secret manager) and keep `.env` out of
version control.

## Docker deployment

A production-shaped Compose file (`infrastructure/docker-compose.prod.yml`)
orchestrates the images and is a working reference for any platform:

```bash
cp .env.example .env.production   # then set real secrets
docker compose -f infrastructure/docker-compose.prod.yml --env-file .env.production build
docker compose -f infrastructure/docker-compose.prod.yml --env-file .env.production \
  --profile tools run --rm migrate
docker compose -f infrastructure/docker-compose.prod.yml --env-file .env.production up -d
```

Differences from the development stack are deliberate:

- Secrets are **required** (`:?` syntax) — nothing falls back to a development
  default.
- PostgreSQL and Redis publish **no host ports**; they are reachable only on the
  Compose network.
- Services run with `init` and a stop grace period so `SIGTERM` triggers graceful
  shutdown.
- The API enables HSTS and disables interactive docs by default.
- Healthchecks gate startup ordering and drive restarts.

### Container health and readiness

| Service | Probe behavior |
| --- | --- |
| API | HTTP `GET /health/ready` — `200` only when PostgreSQL and Redis are reachable. `GET /health/live` never touches a dependency, so a database outage cannot cause a restart loop. |
| Web | HTTP `GET /login` returns `2xx`. |
| Worker | No HTTP probe; readiness is asserted at startup and staleness recovery surfaces interrupted work. |

No health response exposes connection strings or secrets.

## Migration flow

Prisma migrations are applied as an explicit, one-off step — never implicitly on
application start:

```bash
docker compose -f infrastructure/docker-compose.prod.yml --env-file .env.production \
  --profile tools run --rm migrate
```

The `migrate` service runs `prisma migrate deploy` against the target database
and exits. The pipeline runs it once per deploy, before the API and worker are
started. The API image carries the schema, migrations and Prisma config so the
migration runs from the same artifact that serves traffic.

In CI, the same migrations must apply cleanly to an empty database, and a schema
drift check (`migrate diff --exit-code`) guarantees the committed migrations
exactly match the datamodel.

## Monitoring considerations

- **Structured logs.** Each application emits structured logs controlled by
  `LOG_LEVEL`. API requests log a correlation id, method, route pattern, status
  and duration; worker logs carry job, run and queue identifiers, attempt,
  status, duration and error code. Secrets, cookies, request bodies and raw HTML
  are never logged.
- **Health endpoints.** Route liveness and readiness separately: restart on
  liveness failures, remove from load balancing on readiness failures.
- **Queue backlog.** Watch queue depth for the analysis and AI queues; a growing
  backlog indicates worker starvation or provider slowness.
- **Stale work.** Stale runs and stale AI results are recovered after a threshold
  and logged; a rising rate points at crashes or provider timeouts.
- **AI usage.** Provider, model, token counts and estimated cost are persisted
  per result and can feed cost monitoring.
- **Rate limiting.** `429` responses with `Retry-After` are logged; sustained
  throttling may indicate abuse or an undersized budget.

## Security checklist

- [ ] Distinct, strong JWT secrets (≥ 32 characters) in `NODE_ENV=production`.
- [ ] Explicit CORS origins; no wildcard.
- [ ] TLS terminated in front of the API, with HSTS enabled.
- [ ] `TRUST_PROXY` set to the real number of proxy hops for correct client IPs.
- [ ] PostgreSQL and Redis not exposed publicly.
- [ ] `SWAGGER_ENABLED` disabled (or protected) in production.
- [ ] `AI_API_KEY` injected as a secret, never baked into an image.
- [ ] `RATE_LIMIT_REDIS_FAILURE` left at a deliberate value; auth always fails
      closed.

## Future considerations

- The images are not yet exercised by CI; adding a container build step would
  catch Dockerfile regressions early.
- A reverse-proxy example (TLS termination plus the security headers) could be
  documented as a reference deployment.
- Horizontal worker scaling requires lock-aware stale recovery; the job contract
  itself would not change.
