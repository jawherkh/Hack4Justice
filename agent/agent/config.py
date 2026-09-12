"""
Central configuration – loaded from environment variables.
All settings have safe defaults for local development.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Temporal ──────────────────────────────────────────────
    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"

    # ── Task queues (must match TS constants in src/lib/temporal.ts) ──
    queue_graph_ingestion: str = "graph-ingestion"
    queue_sandbox_execution: str = "sandbox-execution"

    # ── Neo4j / Graphiti ──────────────────────────────────────
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # ── MinIO ─────────────────────────────────────────────────
    minio_endpoint: str = "localhost"
    minio_port: int = 9000
    minio_use_ssl: bool = False
    minio_root_user: str = ""
    minio_root_password: str = ""
    minio_bucket_documents: str = "documents"
    minio_bucket_sandbox: str = "sandbox-artifacts"

    # ── OpenAI (used by Graphiti for entity extraction) ───────
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # ── Logging ───────────────────────────────────────────────
    log_level: str = "INFO"


# Module-level singleton
settings = Settings()
