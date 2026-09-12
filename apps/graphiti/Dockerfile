FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY contracts ./contracts
COPY apps/graphiti ./apps/graphiti

RUN pip install --no-cache-dir uv \
  && uv sync --frozen --no-dev

EXPOSE 8010

CMD ["uv", "run", "uvicorn", "apps.graphiti.main:app", "--host", "0.0.0.0", "--port", "8010"]
