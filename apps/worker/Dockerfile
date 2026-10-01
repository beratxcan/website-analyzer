# syntax=docker/dockerfile:1
#
# Build from the repository root so the pnpm workspace manifests are visible:
#   docker build -f apps/worker/Dockerfile -t analyzer-worker .
#
ARG NODE_VERSION=22

# ── Build stage ────────────────────────────────────────────────────────────
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
RUN pnpm --filter @analyzer/worker... build

# ── Runtime stage ──────────────────────────────────────────────────────────
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
COPY --from=build /app/apps/worker/dist apps/worker/dist
# The worker generates the Prisma client from the API schema.
COPY --from=build /app/apps/api/prisma apps/api/prisma
RUN pnpm --filter @analyzer/worker exec prisma generate --schema ../api/prisma/schema.prisma

USER node
# The worker exposes no HTTP port: readiness is asserted at startup (Redis
# PING + `SELECT 1`) and staleness recovery marks interrupted runs.
CMD ["node", "apps/worker/dist/main.js"]
