# syntax=docker/dockerfile:1.6
#
# Multi-stage Dockerfile for the AllFor1 API on Cloud Run.
#
# Stage 1 (builder): installs all deps including dev deps, generates the
# Prisma client, and compiles TypeScript to dist/.
# Stage 2 (runner):  copies only the production node_modules + dist + Prisma
# schema, drops to a non-root user, and starts the server. Smaller image,
# faster cold starts, no toolchain in the runtime layer.

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install all deps (including dev) so we can run prisma generate + tsc.
COPY package.json ./
RUN npm install

# Copy source. .dockerignore keeps the build context small.
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY assets ./assets

# Build: generate Prisma client + compile TS.
RUN npx prisma generate
RUN npm run build

# Drop dev deps so the runtime stage gets a lean node_modules.
RUN npm prune --omit=dev

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

# Build SHA baked into the image so /api/version can report exactly what's
# running. The Cloud Build trigger should pass it: --build-arg GIT_SHA=$COMMIT_SHA
# (or a _GIT_SHA substitution). Empty is fine — /api/version still returns the
# Cloud Run revision, which changes on every deploy.
ARG GIT_SHA=""
ENV BUILD_SHA=${GIT_SHA}

# Non-root user for the runtime.
RUN groupadd --system --gid 1001 app \
 && useradd  --system --uid 1001 --gid app app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist         ./dist
COPY --from=builder --chown=app:app /app/prisma       ./prisma
COPY --from=builder --chown=app:app /app/assets       ./assets
COPY --from=builder --chown=app:app /app/package.json ./package.json

# Create logs directory so Winston doesn't fail at startup.
RUN mkdir -p /app/logs && chown app:app /app/logs

USER app

EXPOSE 8080

# ⚠ THIS FILE IS SUPERSEDED by the root ./Dockerfile and can no longer build the
# API: it installs from the server/ context alone and never copies packages/, so
# the server's @af1/validation and @af1/core dependencies cannot resolve. Confirm
# the Cloud Build trigger uses ./Dockerfile (context = repo root), then delete
# this file — a Dockerfile that looks current but cannot build is a trap.

# Sync schema to DB on boot, then start the server.
#
# The flag is OMITTED, never `--accept-data-loss=false`. Prisma declares it as a
# Boolean and passes it to `push({ force })`; the arg parser evaluates
# Boolean("false") for `--flag=value`, which is TRUE — so that spelling accepts
# data loss rather than forbidding it. Absent is the only spelling meaning false.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
