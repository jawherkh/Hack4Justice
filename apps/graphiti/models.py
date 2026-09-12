"""HTTP and tenancy models for the knowledge-graph service."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Literal

from contracts.models import AgencyCode
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


AGENCY_GROUP_IDS: dict[AgencyCode, str] = {
    AgencyCode.DGI: "dgi",
    AgencyCode.RNE: "rne",
    AgencyCode.APII: "apii",
}


class ServiceModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AgencyScope(ServiceModel):
    """The only source of a Graphiti group id for a request."""

    agency: AgencyCode
    group_id: str

    @classmethod
    def from_header(cls, value: str | None) -> "AgencyScope":
        if not value:
            raise ValueError("X-Agency-Code header is required")
        try:
            agency = AgencyCode(value.strip().upper())
        except ValueError as error:
            allowed = ", ".join(code.value for code in AgencyCode)
            raise ValueError(f"unsupported agency code; expected one of: {allowed}") from error
        return cls(agency=agency, group_id=AGENCY_GROUP_IDS[agency])


class LegalDocument(ServiceModel):
    """A scraped legal source that is ready for Graphiti episode processing."""

    document_id: Annotated[str, Field(min_length=1, max_length=200)]
    title: Annotated[str, Field(min_length=1, max_length=500)]
    text: Annotated[str, Field(min_length=1, max_length=500_000)]
    source_uri: Annotated[str, Field(min_length=1, max_length=2_000)]
    source_kind: Literal["official", "synthetic"] = "official"
    retrieved_at: AwareDatetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    effective_from: date | None = None
    effective_to: date | None = None
    language: Annotated[str, Field(min_length=2, max_length=20)] = "fr"
    section: Annotated[str, Field(max_length=500)] | None = None

    @field_validator("text")
    @classmethod
    def non_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must contain non-whitespace characters")
        return value


class IngestRequest(ServiceModel):
    document: LegalDocument


class BulkIngestRequest(ServiceModel):
    documents: list[LegalDocument] = Field(min_length=1, max_length=100)


class IngestedEpisode(ServiceModel):
    episode_uuid: str
    chunk_index: int
    chunk_count: int
    node_count: int
    edge_count: int


class IngestResponse(ServiceModel):
    agency: AgencyCode
    group_id: str
    document_id: str
    source_kind: Literal["official", "synthetic"]
    status: Literal["processed"] = "processed"
    episodes: list[IngestedEpisode]


class BulkIngestResponse(ServiceModel):
    agency: AgencyCode
    group_id: str
    documents: list[IngestResponse]


class SearchRequest(ServiceModel):
    query: Annotated[str, Field(min_length=1, max_length=1_000)]
    max_results: Annotated[int, Field(ge=1, le=10)] = 10

    @field_validator("query")
    @classmethod
    def non_blank_query(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query must contain non-whitespace characters")
        return value.strip()


class SearchEdge(ServiceModel):
    uuid: str
    name: str
    fact: str
    group_id: str
    source_node_uuid: str
    target_node_uuid: str
    valid_at: datetime | None = None
    invalid_at: datetime | None = None
    episodes: list[str] = Field(default_factory=list)
    attributes: dict[str, object] = Field(default_factory=dict)


class SearchNode(ServiceModel):
    uuid: str
    name: str
    group_id: str
    summary: str = ""
    labels: list[str] = Field(default_factory=list)
    attributes: dict[str, object] = Field(default_factory=dict)


class SearchEpisode(ServiceModel):
    uuid: str
    name: str
    group_id: str
    source: str
    source_description: str
    valid_at: datetime | None = None
    content_excerpt: str = ""


class SearchResponse(ServiceModel):
    agency: AgencyCode
    group_id: str
    query: str
    edges: list[SearchEdge] = Field(default_factory=list)
    nodes: list[SearchNode] = Field(default_factory=list)
    episodes: list[SearchEpisode] = Field(default_factory=list)


class HealthResponse(ServiceModel):
    ok: bool
    service: str = "graphiti"
    graphiti_configured: bool
    graphiti_initialized: bool
