# ─────────────────────────────────────────────
#  hack4justice – multi-stage Dockerfile
# ─────────────────────────────────────────────

# ── Base ──────────────────────────────────────
FROM node:20.14.0-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl
COPY package*.json ./
COPY prisma ./prisma

# ── Development ───────────────────────────────
FROM base AS development
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts
EXPOSE 3000
# Command is supplied by docker-compose

# ── Builder ───────────────────────────────────
FROM base AS builder
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build
RUN npx prisma generate

# ── Production ────────────────────────────────
FROM node:20.14.0-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/api/index.js"]
