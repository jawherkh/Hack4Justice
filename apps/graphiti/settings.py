"""Environment-backed settings for the Graphiti service."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True, slots=True)
class GraphitiSettings:
    """Runtime settings kept separate from the API request models."""

    host: str = "0.0.0.0"
    port: int = 8010
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"
    gemini_api_key: str | None = None
    gemini_llm_model: str = "gemini-2.5-flash"
    gemini_small_model: str = "gemini-2.5-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_embedding_dim: int = 1024
    startup_connect: bool = False
    update_communities: bool = False
    max_coroutines: int | None = 10
    max_text_chars: int = 12_000
    chunk_overlap_chars: int = 400
    # Graphiti's provider client has its own retry loop. These service-level
    # retries cover failures that escape that loop, such as a wrapped Gemini
    # 5xx/timeout error during edge extraction.
    ingest_max_retries: int = 3
    ingest_retry_base_seconds: float = 2.0
    ingest_retry_max_seconds: float = 30.0
    cors_origins: tuple[str, ...] = ("http://localhost:3000",)

    def __post_init__(self) -> None:
        if self.ingest_max_retries < 0:
            raise ValueError("ingest_max_retries must be non-negative")
        if self.ingest_retry_base_seconds < 0:
            raise ValueError("ingest_retry_base_seconds must be non-negative")
        if self.ingest_retry_max_seconds < 0:
            raise ValueError("ingest_retry_max_seconds must be non-negative")

    @classmethod
    def from_env(cls) -> "GraphitiSettings":
        """Load settings without exposing credentials in logs or responses."""

        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        origins = tuple(
            origin.strip()
            for origin in os.getenv("GRAPHITI_CORS_ORIGINS", "http://localhost:3000").split(",")
            if origin.strip()
        )
        max_coroutines_value = os.getenv("GRAPHITI_MAX_COROUTINES", "10")

        return cls(
            host=os.getenv("GRAPHITI_HOST", "0.0.0.0"),
            port=int(os.getenv("GRAPHITI_PORT", "8010")),
            neo4j_uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            neo4j_user=os.getenv("NEO4J_USER", "neo4j"),
            neo4j_password=os.getenv("NEO4J_PASSWORD", "password"),
            gemini_api_key=api_key,
            gemini_llm_model=os.getenv("GEMINI_LLM_MODEL", "gemini-2.5-flash"),
            gemini_small_model=os.getenv("GEMINI_SMALL_MODEL", "gemini-2.5-flash-lite"),
            gemini_embedding_model=os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
            gemini_embedding_dim=int(os.getenv("GEMINI_EMBEDDING_DIM", "1024")),
            startup_connect=_env_bool("GRAPHITI_STARTUP_CONNECT", False),
            update_communities=_env_bool("GRAPHITI_UPDATE_COMMUNITIES", False),
            max_coroutines=None if max_coroutines_value.lower() == "none" else int(max_coroutines_value),
            max_text_chars=int(os.getenv("GRAPHITI_MAX_TEXT_CHARS", "12000")),
            chunk_overlap_chars=int(os.getenv("GRAPHITI_CHUNK_OVERLAP_CHARS", "400")),
            ingest_max_retries=int(os.getenv("GRAPHITI_INGEST_MAX_RETRIES", "3")),
            ingest_retry_base_seconds=float(
                os.getenv("GRAPHITI_INGEST_RETRY_BASE_SECONDS", "2")
            ),
            ingest_retry_max_seconds=float(
                os.getenv("GRAPHITI_INGEST_RETRY_MAX_SECONDS", "30")
            ),
            cors_origins=origins,
        )
