# syntax=docker/dockerfile:1.7
# ─── Stage 1: install ─────────────────────────────────────────────────────────
FROM oven/bun:1.4.2-alpine AS deps

WORKDIR /app

# Copy all workspace manifests + lockfile for layer caching
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

# Install inside the container so bun creates proper Linux symlinks
# and all workspace-scoped node_modules are in the right place
RUN bun install --frozen-lockfile

# ─── Stage 2: production image ────────────────────────────────────────────────
FROM oven/bun:1.4.2-alpine AS runner

RUN addgroup --system --gid 1001 api && \
    adduser --system --uid 1001 --ingroup api api

WORKDIR /app

# Copy the entire node_modules tree from deps (root + all workspace-level)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/storage/node_modules ./packages/storage/node_modules

# Copy source files
COPY apps/api/src ./apps/api/src
COPY apps/api/scripts ./apps/api/scripts
COPY apps/api/package.json ./apps/api/
COPY packages/auth/src ./packages/auth/src
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/src ./packages/db/src
COPY packages/db/package.json ./packages/db/
COPY packages/logger/src ./packages/logger/src
COPY packages/logger/package.json ./packages/logger/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/src ./packages/storage/src
COPY packages/storage/package.json ./packages/storage/
COPY packages/typescript-config ./packages/typescript-config/

RUN mkdir -p /app/.local-data/documents && \
    chown -R api:api /app/.local-data

USER api

EXPOSE 3001

CMD ["bun", "apps/api/src/index.ts"]
