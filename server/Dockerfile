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

# Non-root user for the runtime.
RUN groupadd --system --gid 1001 app \
 && useradd  --system --uid 1001 --gid app app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist         ./dist
COPY --from=builder --chown=app:app /app/prisma       ./prisma
COPY --from=builder --chown=app:app /app/package.json ./package.json

# Create logs directory so Winston doesn't fail at startup.
RUN mkdir -p /app/logs && chown app:app /app/logs

USER app

EXPOSE 8080

# Sync schema to DB on boot (additive, no data loss), then start the server.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss=false && node dist/index.js"]
