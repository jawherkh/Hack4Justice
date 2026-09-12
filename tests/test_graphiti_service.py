import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from apps.graphiti.main import app
from apps.graphiti.models import AgencyScope, LegalDocument
from apps.graphiti.service import GraphitiKnowledgeService, chunk_text
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
        assert all("uuid" not in call for call in fake.added)
        assert all("LegalRule" in call["entity_types"] for call in fake.added)
        assert all("REQUIRES" in call["edge_types"] for call in fake.added)

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
