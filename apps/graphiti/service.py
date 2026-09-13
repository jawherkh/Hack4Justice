"""Graphiti orchestration: Gemini extraction, embedding, Neo4j persistence, and search."""

from __future__ import annotations

import asyncio
import inspect
import logging
from dataclasses import dataclass
from typing import Any, Callable

from chonkie import SentenceChunker

from .models import (
    AgencyScope,
    IngestedEpisode,
    IngestResponse,
    LegalDocument,
    SearchEdge,
    SearchEpisode,
    SearchNode,
    SearchResponse,
)
from .ontology import EDGE_TYPE_MAP, EDGE_TYPES, ENTITY_TYPES, EXTRACTION_INSTRUCTIONS
from .settings import GraphitiSettings

logger = logging.getLogger(__name__)

_RETRYABLE_ERROR_NAMES = {
    "emptyresponseerror",
    "ratelimiterror",
}
_RETRYABLE_ERROR_MARKERS = (
    "429",
    "500",
    "502",
    "503",
    "504",
    "connection reset",
    "connection refused",
    "deadline exceeded",
    "internal server error",
    "rate limit",
    "resource exhausted",
    "temporarily unavailable",
    "timeout",
    "timed out",
    "try again",
    "unavailable",
)
_PERMANENT_ERROR_MARKERS = (
    "authentication",
    "blocked",
    "context length",
    "forbidden",
    "invalid argument",
    "invalid request",
    "malformed",
    "not found",
    "permission",
    "refusal",
    "safety",
    "unauthenticated",
    "unsupported",
)


class GraphitiNotReadyError(RuntimeError):
    """Raised when Neo4j/Gemini configuration is not available."""


@dataclass(frozen=True, slots=True)
class TextChunk:
    """A Chonkie chunk plus offsets that can be used for source evidence."""

    text: str
    start_index: int
    end_index: int
    token_count: int


def chunk_document(text: str, max_chars: int, overlap_chars: int) -> list[TextChunk]:
    """Chunk legal text at sentence boundaries using Chonkie's character tokenizer.

    Chonkie's ``chunk_size`` and ``chunk_overlap`` are token-based settings. The
    character tokenizer makes the existing service configuration names and
    limits map directly to character counts, without adding another tokenizer
    model or downloading a tokenizer vocabulary at runtime.
    """

    if max_chars < 1:
        raise ValueError("max_chars must be positive")
    if overlap_chars < 0 or overlap_chars >= max_chars:
        raise ValueError("overlap_chars must be >= 0 and smaller than max_chars")

    chunker = SentenceChunker(
        tokenizer="character",
        chunk_size=max_chars,
        chunk_overlap=overlap_chars,
        # Legal provisions are often short (for example, “Art. 1.”). Do not
        # discard them because they are below Chonkie's default sentence size.
        min_sentences_per_chunk=1,
        min_characters_per_sentence=1,
        delim=[". ", "! ", "? ", "\n"],
        include_delim="prev",
    )
    chunks: list[TextChunk] = []
    for chunk in chunker.chunk(text):
        if not chunk.text.strip():
            continue

        # SentenceChunker keeps an unusually long sentence intact. Keep that
        # semantic preference, but enforce the service limit as a safety valve
        # for OCR output containing a missing or malformed sentence delimiter.
        if len(chunk.text) <= max_chars:
            chunks.append(
                TextChunk(
                    text=chunk.text,
                    start_index=chunk.start_index,
                    end_index=chunk.end_index,
                    token_count=chunk.token_count,
                )
            )
            continue

        start = chunk.start_index
        while start < chunk.end_index:
            end = min(start + max_chars, chunk.end_index)
            piece = text[start:end]
            if piece.strip():
                chunks.append(
                    TextChunk(
                        text=piece,
                        start_index=start,
                        end_index=end,
                        token_count=len(piece),
                    )
                )
            if end >= chunk.end_index:
                break
            start = max(end - overlap_chars, start + 1)
    return chunks


def chunk_text(text: str, max_chars: int, overlap_chars: int) -> list[str]:
    """Compatibility helper returning only the text of each Chonkie chunk."""

    return [chunk.text for chunk in chunk_document(text, max_chars, overlap_chars)]


def _get(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _exception_chain(error: BaseException) -> list[BaseException]:
    """Return an exception and its causes, including Graphiti's wrappers."""

    chain: list[BaseException] = []
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        chain.append(current)
        current = current.__cause__ or current.__context__
    return chain


def _status_code(error: BaseException) -> int | None:
    for attribute in ("status_code", "code"):
        value = getattr(error, attribute, None)
        if isinstance(value, int):
            return value
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    response = getattr(error, "response", None)
    value = getattr(response, "status_code", None)
    return value if isinstance(value, int) else None


def _is_retryable_episode_error(error: BaseException) -> bool:
    """Identify failures worth retrying after Graphiti exhausts provider retries.

    Graphiti's Gemini client can re-raise a bare ``Exception`` with the provider
    failure attached as ``__cause__``. Inspecting the complete chain preserves
    retry behavior for those wrapped 429/5xx/timeout errors while avoiding
    retries for authentication, permissions, malformed requests, and refusals.
    Unknown errors remain retryable because this boundary is an external LLM
    operation and the retry count is explicitly bounded by configuration.
    """

    chain = _exception_chain(error)
    messages = " ".join(
        f"{type(item).__name__} {item}".lower()
        for item in chain
    )
    status_codes = [_status_code(item) for item in chain]

    if any(
        status is not None and 400 <= status < 500 and status not in {408, 425, 429}
        for status in status_codes
    ):
        return False
    if any(marker in messages for marker in _PERMANENT_ERROR_MARKERS):
        return False
    if any(
        status is not None and (status in {408, 425, 429} or status >= 500)
        for status in status_codes
    ):
        return True
    if any(
        isinstance(item, (ConnectionError, TimeoutError, OSError))
        or type(item).__name__.lower() in _RETRYABLE_ERROR_NAMES
        for item in chain
    ):
        return True
    return any(marker in messages for marker in _RETRYABLE_ERROR_MARKERS) or bool(chain)


class GraphitiKnowledgeService:
    """Own one Graphiti client and serialize all episode writes through it."""

    def __init__(
        self,
        settings: GraphitiSettings | None = None,
        client_factory: Callable[[], Any] | None = None,
    ) -> None:
        self.settings = settings or GraphitiSettings.from_env()
        self._client_factory = client_factory
        self._client: Any | None = None
        self._initialization_lock = asyncio.Lock()
        self._write_lock = asyncio.Lock()
        self._last_error: str | None = None

    @property
    def initialized(self) -> bool:
        return self._client is not None

    @property
    def configured(self) -> bool:
        return bool(self.settings.gemini_api_key) and bool(self.settings.neo4j_uri)

    @property
    def last_error(self) -> str | None:
        return self._last_error

    async def connect(self) -> None:
        """Create the Gemini-backed Graphiti client and ensure Neo4j indexes exist."""

        if self._client is not None:
            return
        if not self.settings.gemini_api_key:
            raise GraphitiNotReadyError("GEMINI_API_KEY or GOOGLE_API_KEY is not configured")

        async with self._initialization_lock:
            if self._client is not None:
                return
            client: Any | None = None
            try:
                client = self._client_factory() if self._client_factory else self._build_client()
                await client.build_indices_and_constraints()
                self._client = client
                self._last_error = None
                logger.info("Graphiti connected to Neo4j and indexes are ready")
            except Exception as error:
                if client is not None:
                    close_result = client.close()
                    if inspect.isawaitable(close_result):
                        await close_result
                self._last_error = type(error).__name__
                logger.exception("Unable to initialize Graphiti")
                raise GraphitiNotReadyError("Graphiti could not initialize Neo4j indexes") from error

    def _build_client(self) -> Any:
        from graphiti_core import Graphiti
        from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig
        from graphiti_core.llm_client.gemini_client import GeminiClient, LLMConfig

        api_key = self.settings.gemini_api_key
        llm_config = LLMConfig(
            api_key=api_key,
            model=self.settings.gemini_llm_model,
            small_model=self.settings.gemini_small_model,
            temperature=0,
        )
        return Graphiti(
            self.settings.neo4j_uri,
            self.settings.neo4j_user,
            self.settings.neo4j_password,
            llm_client=GeminiClient(config=llm_config),
            embedder=GeminiEmbedder(
                config=GeminiEmbedderConfig(
                    api_key=api_key,
                    embedding_model=self.settings.gemini_embedding_model,
                    embedding_dim=self.settings.gemini_embedding_dim,
                )
            ),
            cross_encoder=GeminiRerankerClient(
                config=LLMConfig(
                    api_key=api_key,
                    model=self.settings.gemini_small_model,
                    temperature=0,
                )
            ),
            store_raw_episode_content=True,
            max_coroutines=self.settings.max_coroutines,
        )

    async def close(self) -> None:
        if self._client is None:
            return
        close_result = self._client.close()
        if inspect.isawaitable(close_result):
            await close_result
        self._client = None

    async def ingest_document(self, scope: AgencyScope, document: LegalDocument) -> IngestResponse:
        await self.connect()
        assert self._client is not None

        chunks = chunk_document(
            document.text,
            max_chars=self.settings.max_text_chars,
            overlap_chars=self.settings.chunk_overlap_chars,
        )
        episodes: list[IngestedEpisode] = []

        # Graphiti recommends sequential episode writes because each write uses
        # the recent graph context to resolve entities and relationships.
        async with self._write_lock:
            for index, chunk in enumerate(chunks):
                body = self._episode_body(document, chunk, index, len(chunks))
                result = await self._add_episode_with_retry(
                    name=f"{document.title} [{index + 1}/{len(chunks)}]",
                    episode_body=body,
                    source_description=(
                        f"{document.source_kind} legal source {document.source_uri}; "
                        f"document_id={document.document_id}"
                    ),
                    reference_time=document.retrieved_at,
                    source=self._episode_type_text(),
                    group_id=scope.group_id,
                    update_communities=self.settings.update_communities,
                    entity_types=ENTITY_TYPES,
                    edge_types=EDGE_TYPES,
                    edge_type_map=EDGE_TYPE_MAP,
                    custom_extraction_instructions=EXTRACTION_INSTRUCTIONS,
                )
                episodes.append(
                    IngestedEpisode(
                        episode_uuid=_get(_get(result, "episode"), "uuid", ""),
                        chunk_index=index,
                        chunk_count=len(chunks),
                        node_count=len(_get(result, "nodes", [])),
                        edge_count=len(_get(result, "edges", [])),
                        start_index=chunk.start_index,
                        end_index=chunk.end_index,
                        token_count=chunk.token_count,
                    )
                )
        return IngestResponse(
            agency=scope.agency,
            group_id=scope.group_id,
            document_id=document.document_id,
            source_kind=document.source_kind,
            episodes=episodes,
        )

    async def _add_episode_with_retry(self, **kwargs: Any) -> Any:
        """Write one episode with bounded exponential backoff."""

        assert self._client is not None
        max_attempts = self.settings.ingest_max_retries + 1
        for attempt in range(max_attempts):
            try:
                return await self._client.add_episode(**kwargs)
            except Exception as error:
                is_last_attempt = attempt == max_attempts - 1
                if is_last_attempt or not _is_retryable_episode_error(error):
                    raise

                delay = min(
                    self.settings.ingest_retry_max_seconds,
                    self.settings.ingest_retry_base_seconds * (2**attempt),
                )
                logger.warning(
                    "Graphiti episode write failed on attempt %d/%d; retrying in %.2fs: %s",
                    attempt + 1,
                    max_attempts,
                    delay,
                    " -> ".join(
                        f"{type(item).__name__}: {item}" for item in _exception_chain(error)
                    ),
                )
                await asyncio.sleep(delay)

        raise AssertionError("unreachable retry loop")

    @staticmethod
    def _episode_type_text() -> Any:
        from graphiti_core.nodes import EpisodeType

        return EpisodeType.text

    @staticmethod
    def _episode_body(document: LegalDocument, chunk: TextChunk, index: int, count: int) -> str:
        metadata = [
            "LEGAL SOURCE METADATA",
            f"document_id: {document.document_id}",
            f"title: {document.title}",
            f"source_uri: {document.source_uri}",
            f"source_kind: {document.source_kind}",
            f"retrieved_at: {document.retrieved_at.isoformat()}",
            f"language: {document.language}",
            f"chunk: {index + 1}/{count}",
            f"chunk_start_index: {chunk.start_index}",
            f"chunk_end_index: {chunk.end_index}",
            f"chunk_token_count: {chunk.token_count}",
        ]
        if document.effective_from:
            metadata.append(f"effective_from: {document.effective_from.isoformat()}")
        if document.effective_to:
            metadata.append(f"effective_to: {document.effective_to.isoformat()}")
        if document.section:
            metadata.append(f"section: {document.section}")
        return "\n".join(metadata) + "\n\nLEGAL SOURCE PASSAGE\n" + chunk.text

    async def search(self, scope: AgencyScope, query: str, max_results: int) -> SearchResponse:
        await self.connect()
        assert self._client is not None

        # This is the intentional tenant boundary: the group id is always
        # derived from X-Agency-Code and never accepted from the request body.
        if hasattr(self._client, "search_"):
            result = await self._client.search_(
                query,
                group_ids=[scope.group_id],
                config=self._search_config(),
            )
        else:
            # Compatibility for older Graphiti releases before search_ became
            # the advanced search API. The pinned version uses the branch above.
            result = await self._client.search(
                query,
                group_ids=[scope.group_id],
                num_results=max_results,
            )

        if isinstance(result, list):
            result = {"edges": result}
        return SearchResponse(
            agency=scope.agency,
            group_id=scope.group_id,
            query=query,
            edges=[self._edge(item) for item in (_get(result, "edges", []) or [])[:max_results]],
            nodes=[self._node(item) for item in (_get(result, "nodes", []) or [])[:max_results]],
            episodes=[
                self._episode(item)
                for item in (_get(result, "episodes", []) or [])[:max_results]
            ],
        )

    @staticmethod
    def _search_config() -> Any:
        from graphiti_core.search.search_config_recipes import (
            COMBINED_HYBRID_SEARCH_CROSS_ENCODER,
        )

        return COMBINED_HYBRID_SEARCH_CROSS_ENCODER

    @staticmethod
    def _edge(edge: Any) -> SearchEdge:
        return SearchEdge(
            uuid=_get(edge, "uuid", ""),
            name=_get(edge, "name", ""),
            fact=_get(edge, "fact", ""),
            group_id=_get(edge, "group_id", ""),
            source_node_uuid=_get(edge, "source_node_uuid", ""),
            target_node_uuid=_get(edge, "target_node_uuid", ""),
            valid_at=_get(edge, "valid_at"),
            invalid_at=_get(edge, "invalid_at"),
            episodes=list(_get(edge, "episodes", []) or []),
            attributes=dict(_get(edge, "attributes", {}) or {}),
        )

    @staticmethod
    def _node(node: Any) -> SearchNode:
        return SearchNode(
            uuid=_get(node, "uuid", ""),
            name=_get(node, "name", ""),
            group_id=_get(node, "group_id", ""),
            summary=_get(node, "summary", "") or "",
            labels=list(_get(node, "labels", []) or []),
            attributes=dict(_get(node, "attributes", {}) or {}),
        )

    @staticmethod
    def _episode(episode: Any) -> SearchEpisode:
        content = _get(episode, "content", "") or ""
        source = _get(episode, "source", "")
        source_value = _get(source, "value", source)
        return SearchEpisode(
            uuid=_get(episode, "uuid", ""),
            name=_get(episode, "name", ""),
            group_id=_get(episode, "group_id", ""),
            source=str(source_value),
            source_description=_get(episode, "source_description", ""),
            valid_at=_get(episode, "valid_at"),
            content_excerpt=content[:2_000],
        )
