# syntax=docker/dockerfile:1
#
# Build from the repository root so the pnpm workspace manifests are visible:
#   docker build -f apps/api/Dockerfile -t analyzer-api .
#
ARG NODE_VERSION=22

# ── Build stage ────────────────────────────────────────────────────────────
# Full workspace install + compile. Manifests are copied before sources so the
# dependency layer is cached independently of code changes.
FROM node:${NODE_VERSION}-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/analysis/package.json packages/analysis/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/report/package.json packages/report/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @analyzer/api... build

# ── Runtime stage ──────────────────────────────────────────────────────────
# Production dependencies only (workspace packages resolve to their compiled
# dist folders, copied explicitly below). Runs as the unprivileged `node` user.
FROM node:${NODE_VERSION}-alpine AS runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/analysis/package.json packages/analysis/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/report/package.json packages/report/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/packages/config/dist packages/config/dist
COPY --from=build /app/packages/analysis/dist packages/analysis/dist
COPY --from=build /app/packages/ai/dist packages/ai/dist
COPY --from=build /app/packages/report/dist packages/report/dist
COPY --from=build /app/apps/api/dist apps/api/dist
# Schema, migrations and the Prisma config are kept so the deployment step can
# run `prisma migrate deploy` from the same artifact.
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts apps/api/prisma.config.ts
RUN pnpm --filter @analyzer/api exec prisma generate

USER node
EXPOSE 4000
# Health/readiness are probed over HTTP: GET /health and GET /health/ready.
CMD ["node", "apps/api/dist/main.js"]
