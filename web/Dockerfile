# allfor1-web — public SSR renderer for Cloud Run. Build context = web/.
FROM node:20-bookworm-slim

WORKDIR /app

# Runtime deps only (pg + tsx). No build step — tsx runs the TS directly.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
# Cloud Run sets PORT (default 8080); server.ts reads it.
EXPOSE 8080
# Run as the non-root node user.
USER node
CMD ["node", "--import", "tsx", "src/server.ts"]
