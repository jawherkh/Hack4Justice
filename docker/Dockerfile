FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV CI=true

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
COPY contracts ./contracts
COPY docker ./docker

ARG VITE_API_URL=http://localhost:8082
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @hack4justice/api build
RUN pnpm --filter @hack4justice/web build
RUN pnpm --filter @hack4justice/admin build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.21.0 --activate

COPY --from=build /app /app

EXPOSE 3000 3001 3002

