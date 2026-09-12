# ─────────────────────────────────────────────
#  hack4justice – Python agent  (multi-stage)
# ─────────────────────────────────────────────

# ── Base ──────────────────────────────────────
FROM python:3.11.9-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install pip + uv for fast dependency installs
RUN pip install --no-cache-dir uv==0.2.37

COPY pyproject.toml ./

# ── Development ───────────────────────────────
FROM base AS development
RUN uv pip install --system -e ".[dev]"
COPY . .
# Command supplied by docker-compose

# ── Production ────────────────────────────────
FROM base AS production
RUN uv pip install --system --no-dev .
COPY agent ./agent
