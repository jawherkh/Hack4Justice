# syntax=docker/dockerfile:1.7
# ─── Stage 1: install + build ─────────────────────────────────────────────────
# Everything runs inside the container — we never copy node_modules from the
# host, which avoids Windows junction-point issues with bun workspace symlinks.
FROM oven/bun:1.4.2-alpine AS builder

WORKDIR /app

# Copy manifests and lockfile first for layer caching
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/package.json ./packages/db/
COPY packages/logger/package.json ./packages/logger/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/

# Install inside the container — bun creates proper Linux symlinks here
RUN bun install --frozen-lockfile

# Now copy the actual source
COPY apps/web/src ./apps/web/src
COPY apps/web/tsconfig.json apps/web/vite.config.ts apps/web/tsr.config.json apps/web/server.mjs ./apps/web/
COPY packages ./packages

# Build args for VITE_* env vars — inlined into the client bundle at build time
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/apps/web

RUN /app/apps/web/node_modules/.bin/vite build && \
    echo "Build complete. Output directory:" && \
    ls -la /app/apps/web/ | grep -E "\.output|dist|build" || echo "WARNING: no output directory found"

# ─── Stage 2: production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN addgroup --system --gid 1001 web && \
    adduser --system --uid 1001 --ingroup web web

WORKDIR /app

# Copy only what's needed to run the SSR server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/web/server.mjs ./apps/web/server.mjs
COPY --from=builder /app/packages ./packages
COPY package.json ./

USER web

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app/apps/web

CMD ["node", "server.mjs"]
