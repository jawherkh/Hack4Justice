import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from apps.graphiti.main import app
from apps.graphiti.models import AgencyScope, LegalDocument
from apps.graphiti.service import GraphitiKnowledgeService, chunk_document, chunk_text
from apps.graphiti.settings import GraphitiSettings
from contracts.models import AgencyCode


def test_agency_scope_derives_safe_group_id_from_shared_enum():
    assert AgencyScope.from_header("dGi") == AgencyScope(agency=AgencyCode.DGI, group_id="dgi")
    assert AgencyScope.from_header("APII").group_id == "apii"


def test_ontology_header_is_required_and_scoped():
    with TestClient(app) as client:
        assert client.get("/api/v1/ontology").status_code == 400
        response = client.get("/api/v1/ontology", headers={"X-Agency-Code": "RNE"})

    assert response.status_code == 200
    assert response.json()["active_agency"] == "RNE"
    assert response.json()["active_group_id"] == "rne"


def test_chunk_text_respects_limit_and_keeps_boundaries():
    text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
    chunks = chunk_text(text, max_chars=24, overlap_chars=4)
    assert chunks[0].startswith("First paragraph")
    assert chunks[-1].endswith("paragraph.")
    assert all(len(chunk) <= 24 for chunk in chunks)
    assert "Second paragraph." in " ".join(chunks)


def test_chunk_document_returns_chonkie_offsets_and_token_counts():
    text = "Art. 1. Tax applies. Art. 2. Filing is annual."

    chunks = chunk_document(text, max_chars=24, overlap_chars=4)

    assert chunks
    assert all(chunk.text == text[chunk.start_index : chunk.end_index] for chunk in chunks)
    assert all(chunk.token_count == len(chunk.text) for chunk in chunks)
    assert chunks[0].text.startswith("Art. 1.")


def test_chunk_document_has_a_hard_limit_for_oversized_ocr_sentences():
    text = "A malformed OCR line " + ("without a sentence delimiter " * 8)

    chunks = chunk_document(text, max_chars=40, overlap_chars=5)

    assert len(chunks) > 1
    assert all(len(chunk.text) <= 40 for chunk in chunks)
    assert chunks[0].start_index == 0
    assert chunks[-1].end_index == len(text)


class FakeGraphiti:
    def __init__(self):
        self.added = []
        self.search_calls = []

    async def build_indices_and_constraints(self):
        return None

    async def add_episode(self, **kwargs):
        self.added.append(kwargs)
        return SimpleNamespace(
            episode=SimpleNamespace(uuid=str(uuid4())),
            nodes=[object(), object()],
            edges=[object()],
        )

    async def search_(self, query, *, group_ids, config):
        self.search_calls.append((query, group_ids, config))
        return SimpleNamespace(
            edges=[
                SimpleNamespace(
                    uuid="edge-1",
                    name="REQUIRES",
                    fact="A quittance fiscale is required.",
                    group_id="dgi",
                    source_node_uuid="a",
                    target_node_uuid="b",
                    episodes=[],
                    attributes={},
                )
            ],
            nodes=[],
            episodes=[],
        )

    async def close(self):
        return None


def test_ingestion_passes_provenance_ontology_and_group_id():
    async def run():
        fake = FakeGraphiti()
        service = GraphitiKnowledgeService(
            GraphitiSettings(
                gemini_api_key="test-key",
                max_text_chars=80,
                chunk_overlap_chars=10,
            ),
            client_factory=lambda: fake,
        )
        document = LegalDocument(
            document_id="source-1",
            title="Tax guide",
            text="A business must file a quarterly declaration.\n\nThe DGI receives it.",
            source_uri="https://example.gov.tn/tax-guide",
            retrieved_at=datetime.now(timezone.utc),
        )

        response = await service.ingest_document(AgencyScope.from_header("DGI"), document)

        assert response.group_id == "dgi"
        assert len(fake.added) == len(response.episodes)
        assert all(call["group_id"] == "dgi" for call in fake.added)
        assert all(call["source_description"].startswith("official legal source") for call in fake.added)
        assert all("LEGAL SOURCE PASSAGE" in call["episode_body"] for call in fake.added)
        assert all("chunk_start_index:" in call["episode_body"] for call in fake.added)
        assert all("uuid" not in call for call in fake.added)
        assert all("LegalRule" in call["entity_types"] for call in fake.added)
        assert all("REQUIRES" in call["edge_types"] for call in fake.added)
        assert all(episode.token_count > 0 for episode in response.episodes)

    asyncio.run(run())


def test_ingestion_writes_the_exact_chonkie_chunks_as_episodes():
    async def run():
        fake = FakeGraphiti()
        settings = GraphitiSettings(
            gemini_api_key="test-key",
            max_text_chars=72,
            chunk_overlap_chars=12,
        )
        service = GraphitiKnowledgeService(settings, client_factory=lambda: fake)
        document = LegalDocument(
            document_id="multilingual-source",
            title="Multilingual legal source",
            text=(
                "Article premier. Les recettes fiscales sont déclarées chaque année. "
                "الفصل الثاني. يجب إيداع التصريح قبل الأجل القانوني. "
                "Article trois. La quittance accompagne le dossier administratif."
            ),
            source_uri="https://example.gov.tn/multilingual-source",
            retrieved_at=datetime.now(timezone.utc),
            language="fra+ara",
        )
        expected_chunks = chunk_document(
            document.text,
            max_chars=settings.max_text_chars,
            overlap_chars=settings.chunk_overlap_chars,
        )

        response = await service.ingest_document(AgencyScope.from_header("DGI"), document)

        assert len(expected_chunks) > 1
        assert len(fake.added) == len(expected_chunks) == len(response.episodes)
        for index, (chunk, call, episode) in enumerate(
            zip(expected_chunks, fake.added, response.episodes, strict=True)
        ):
            assert call["name"] == f"{document.title} [{index + 1}/{len(expected_chunks)}]"
            assert call["episode_body"].endswith("LEGAL SOURCE PASSAGE\n" + chunk.text)
            assert f"chunk_start_index: {chunk.start_index}" in call["episode_body"]
            assert f"chunk_end_index: {chunk.end_index}" in call["episode_body"]
            assert f"chunk_token_count: {chunk.token_count}" in call["episode_body"]
            assert episode.chunk_index == index
            assert episode.chunk_count == len(expected_chunks)
            assert episode.start_index == chunk.start_index
            assert episode.end_index == chunk.end_index
            assert episode.token_count == chunk.token_count

    asyncio.run(run())


def test_ingestion_retries_transient_episode_failures_with_exponential_backoff():
    async def run():
        fake = FakeGraphiti()
        attempts = 0

        async def flaky_add_episode(**kwargs):
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                try:
                    raise RuntimeError("503 service unavailable")
                except RuntimeError as cause:
                    raise Exception from cause
            return await FakeGraphiti.add_episode(fake, **kwargs)

        fake.add_episode = flaky_add_episode
        service = GraphitiKnowledgeService(
            GraphitiSettings(
                gemini_api_key="test-key",
                ingest_max_retries=2,
                ingest_retry_base_seconds=1,
                ingest_retry_max_seconds=10,
            ),
            client_factory=lambda: fake,
        )
        document = LegalDocument(
            document_id="retry-source",
            title="Retryable source",
            text="A business must file a declaration.",
            source_uri="https://example.gov.tn/retryable-source",
            retrieved_at=datetime.now(timezone.utc),
        )

        delays = []

        async def capture_sleep(delay):
            delays.append(delay)

        with patch("apps.graphiti.service.asyncio.sleep", new=capture_sleep):
            response = await service.ingest_document(AgencyScope.from_header("DGI"), document)

        assert attempts == 3
        assert delays == [1, 2]
        assert len(response.episodes) == 1
        assert len(fake.added) == 1

    asyncio.run(run())


def test_ingestion_skips_failed_chunks_and_continues_with_later_chunks():
    async def run():
        fake = FakeGraphiti()
        attempts = 0

        async def permanent_failure(**kwargs):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError("permission denied")
            return await FakeGraphiti.add_episode(fake, **kwargs)

        fake.add_episode = permanent_failure
        service = GraphitiKnowledgeService(
            GraphitiSettings(
                gemini_api_key="test-key",
                ingest_max_retries=3,
                ingest_retry_base_seconds=0,
                max_text_chars=40,
                chunk_overlap_chars=0,
            ),
            client_factory=lambda: fake,
        )
        document = LegalDocument(
            document_id="permanent-source",
            title="Permanent failure source",
            text="First sentence fails. Second sentence succeeds.",
            source_uri="https://example.gov.tn/permanent-source",
            retrieved_at=datetime.now(timezone.utc),
        )

        response = await service.ingest_document(AgencyScope.from_header("DGI"), document)

        assert attempts == 2
        assert response.status == "partial"
        assert len(response.episodes) == 1
        assert len(response.skipped_chunks) == 1
        assert response.skipped_chunks[0].chunk_index == 0
        assert response.skipped_chunks[0].error == "RuntimeError: permission denied"

    asyncio.run(run())


def test_search_uses_requested_cross_encoder_recipe_and_scope():
    async def run():
        fake = FakeGraphiti()
        service = GraphitiKnowledgeService(
            GraphitiSettings(gemini_api_key="test-key"),
            client_factory=lambda: fake,
        )

        response = await service.search(AgencyScope.from_header("DGI"), "tax clearance", 10)

        assert response.group_id == "dgi"
        assert response.edges[0].fact == "A quittance fiscale is required."
        assert fake.search_calls[0][1] == ["dgi"]
        assert fake.search_calls[0][2].limit == 10

    asyncio.run(run())
