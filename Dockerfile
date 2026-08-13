# syntax=docker/dockerfile:1.6
#
# Root-context, workspace-aware build for the AllFor1 API on Cloud Run.
#
# This replaces server/Dockerfile's isolated (context=server/) build so the API
# can consume shared workspace packages (@af1/*) as the monorepo extraction
# proceeds. It is BEHAVIOUR-NEUTRAL on its own: it compiles the exact same server
# source and produces the exact same runtime layout (/app/dist, /app/prisma,
# /app/assets, /app/package.json, /app/node_modules). The only change is the
# build context (repo root) and a deterministic, server-scoped workspace install.
#
# Cloud Build trigger must build with context = REPO ROOT and dockerfile = ./Dockerfile.
# Pass the commit SHA: --build-arg GIT_SHA=$COMMIT_SHA (for /api/version).

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Workspace manifests + lockfile → a deterministic, server-scoped install.
# Copying every workspace's package.json lets npm validate the workspace tree;
# `-w server` then installs ONLY the server's dependency graph (no web client),
# so the runtime node_modules stays lean. packages/ is copied so npm links the
# server's @af1/* deps and can resolve them at build + runtime. Add each new
# server-consumed package to the `npm run build -w` line below.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
COPY packages ./packages
# The root `prepare` script installs local git hooks — irrelevant and absent in
# the image. Drop it from the in-image manifest only (repo unchanged) so it
# doesn't run on install; dependency install scripts still run.
RUN npm pkg delete scripts.prepare
RUN npm ci --workspace server

# Server source only.
COPY server/tsconfig.json ./server/tsconfig.json
COPY server/prisma ./server/prisma
COPY server/src ./server/src
COPY server/assets ./server/assets

# Build the server-consumed @af1/* packages to JS first (the server runs plain
# node and requires their compiled dist), then build the server.
RUN npm run build -w @af1/validation -w @af1/core
# Build: prisma client + tsc → server/dist.
RUN npm run build --workspace server

# Drop the server workspace's dev deps for a lean runtime node_modules.
RUN npm prune --omit=dev --workspace server

# ─── Runner ──────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

# OpenSSL is needed by the Prisma engine on debian-slim.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT — default to 8080 for local docker run.
ENV PORT=8080

# Build SHA baked in so /api/version reports exactly what's running.
ARG GIT_SHA=""
ENV BUILD_SHA=${GIT_SHA}

# Non-root user for the runtime.
RUN groupadd --system --gid 1001 app \
 && useradd  --system --uid 1001 --gid app app

# Runtime layout: /app/dist + prisma + assets + package.json, node_modules hoisted
# to the workspace root, and packages/ carrying the @af1/* compiled dist that the
# node_modules symlinks resolve to.
COPY --from=builder --chown=app:app /app/node_modules      ./node_modules
COPY --from=builder --chown=app:app /app/packages          ./packages
COPY --from=builder --chown=app:app /app/server/dist       ./dist
COPY --from=builder --chown=app:app /app/server/prisma     ./prisma
COPY --from=builder --chown=app:app /app/server/assets     ./assets
COPY --from=builder --chown=app:app /app/server/package.json ./package.json

# Create logs directory so Winston doesn't fail at startup.
RUN mkdir -p /app/logs && chown app:app /app/logs

USER app
EXPOSE 8080

# Sync schema to DB on boot, then start the server.
#
# The flag is OMITTED, never passed as `--accept-data-loss=false`. Prisma
# declares it as a Boolean and hands it straight to `push({ force })`; the arg
# parser, given `--flag=value` on a Boolean, evaluates Boolean("false") — which
# is TRUE. That spelling therefore accepts data loss, the exact opposite of what
# it reads like, and would let a destructive diff drop production columns on a
# container boot with no warning and no record. Absent is the only spelling that
# means false.
#
# With it absent, a destructive diff makes `db push` refuse and the container
# fail to start. That is deliberate: an API that won't boot is a page, whereas
# silently dropped columns are discovered weeks later by their absence.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
