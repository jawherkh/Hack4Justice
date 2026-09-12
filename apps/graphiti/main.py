"""Uvicorn entry point for the Graphiti knowledge-graph microservice."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    AgencyScope,
    BulkIngestRequest,
    BulkIngestResponse,
    HealthResponse,
    IngestRequest,
    IngestResponse,
    SearchRequest,
    SearchResponse,
)
from .ontology import ontology_definition
from .service import GraphitiKnowledgeService, GraphitiNotReadyError
from .settings import GraphitiSettings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = GraphitiSettings.from_env()
    service = GraphitiKnowledgeService(settings)
    app.state.graphiti_service = service
    if settings.startup_connect:
        try:
            await service.connect()
        except GraphitiNotReadyError:
            # Keep the process available for health diagnostics. Data routes
            # return a clear 503 until the dependency configuration is fixed.
            logger.warning("Graphiti startup connection failed; service is not ready")
    yield
    await service.close()


app = FastAPI(
    title="Hack4Justice Graphiti Service",
    version="0.1.0",
    description=(
        "Agency-scoped legal-source ingestion and hybrid knowledge-graph search "
        "backed by Neo4j and Gemini."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(GraphitiSettings.from_env().cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Agency-Code"],
)


def graphiti_service(request: Request) -> GraphitiKnowledgeService:
    return request.app.state.graphiti_service


def agency_scope(
    agency_code: Annotated[str | None, Header(alias="X-Agency-Code")] = None,
) -> AgencyScope:
    try:
        return AgencyScope.from_header(agency_code)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


def not_ready(error: GraphitiNotReadyError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error))


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health(service: Annotated[GraphitiKnowledgeService, Depends(graphiti_service)]) -> HealthResponse:
    return HealthResponse(
        ok=True,
        graphiti_configured=service.configured,
        graphiti_initialized=service.initialized,
    )


@app.get("/ready", response_model=HealthResponse, tags=["system"])
async def ready(service: Annotated[GraphitiKnowledgeService, Depends(graphiti_service)]) -> HealthResponse:
    if not service.initialized:
        try:
            await service.connect()
        except GraphitiNotReadyError as error:
            raise not_ready(error) from error
    return HealthResponse(
        ok=True,
        graphiti_configured=service.configured,
        graphiti_initialized=service.initialized,
    )


@app.get("/api/v1/ontology", tags=["ontology"])
async def ontology(scope: Annotated[AgencyScope, Depends(agency_scope)]) -> dict[str, object]:
    definition = ontology_definition()
    definition["active_agency"] = scope.agency
    definition["active_group_id"] = scope.group_id
    return definition


@app.post("/api/v1/knowledge/ingest", response_model=IngestResponse, tags=["knowledge"])
async def ingest(
    request: IngestRequest,
    scope: Annotated[AgencyScope, Depends(agency_scope)],
    service: Annotated[GraphitiKnowledgeService, Depends(graphiti_service)],
) -> IngestResponse:
    try:
        return await service.ingest_document(scope, request.document)
    except GraphitiNotReadyError as error:
        raise not_ready(error) from error


@app.post("/api/v1/knowledge/ingest/bulk", response_model=BulkIngestResponse, tags=["knowledge"])
async def ingest_bulk(
    request: BulkIngestRequest,
    scope: Annotated[AgencyScope, Depends(agency_scope)],
    service: Annotated[GraphitiKnowledgeService, Depends(graphiti_service)],
) -> BulkIngestResponse:
    results: list[IngestResponse] = []
    try:
        for document in request.documents:
            results.append(await service.ingest_document(scope, document))
    except GraphitiNotReadyError as error:
        raise not_ready(error) from error
    return BulkIngestResponse(agency=scope.agency, group_id=scope.group_id, documents=results)


@app.post("/api/v1/knowledge/search", response_model=SearchResponse, tags=["knowledge"])
async def search(
    request: SearchRequest,
    scope: Annotated[AgencyScope, Depends(agency_scope)],
    service: Annotated[GraphitiKnowledgeService, Depends(graphiti_service)],
) -> SearchResponse:
    try:
        return await service.search(scope, request.query, request.max_results)
    except GraphitiNotReadyError as error:
        raise not_ready(error) from error


if __name__ == "__main__":
    import uvicorn

    settings = GraphitiSettings.from_env()
    uvicorn.run("apps.graphiti.main:app", host=settings.host, port=settings.port, reload=False)
