# Deployment

This section covers running the system: on a developer machine for day-to-day
work, and in a production-shaped container environment.

## Documents

| Document | Covers |
| --- | --- |
| [local-development.md](./local-development.md) | Prerequisites, installation, environment setup, running services and tests on a local machine. |
| [production-deployment.md](./production-deployment.md) | Containerized deployment, required environment variables, the migration flow, and operational monitoring considerations. |

## Deployment shape

The system deploys as four pieces against two stateful services:

```text
Web (Next.js)   ──►  API (NestJS)  ──►  PostgreSQL
                          │
                          └──►  Redis  ◄──  Worker (BullMQ consumers)
```

- **Web** serves the dashboard and talks to the API.
- **API** owns authentication, ownership, validation, persistence and the report
  endpoints, and serves liveness/readiness probes.
- **Worker** consumes the analysis and AI queues. It exposes no HTTP surface.
- **PostgreSQL** and **Redis** are the only stateful dependencies; PostgreSQL is
  authoritative, Redis carries work and counters.

Each of the three applications ships a multi-stage Dockerfile that builds from
the repository root, installs production dependencies only, and runs as an
unprivileged user. Local development runs the applications directly with pnpm
and uses Docker only for PostgreSQL and Redis.
