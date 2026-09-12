"""
Temporal workflows – graph ingestion.
Run on the graph-ingestion task queue.
"""
from __future__ import annotations

from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from agent.activities.graph_activities import (
        IngestEpisodeParams,
        IngestNodeParams,
        IngestRelationshipParams,
        ingest_episode,
        ingest_node,
        ingest_relationship,
    )

_ACTIVITY_OPTS = dict(
    start_to_close_timeout=timedelta(minutes=5),
    retry_policy=workflow.RetryPolicy(maximum_attempts=3),
)


@workflow.defn(name="IngestDocumentWorkflow")
class IngestDocumentWorkflow:
    """
    Ingests a document into the Graphiti knowledge graph.
    Graphiti extracts entities/relationships automatically via LLM.
    """

    @workflow.run
    async def run(self, params: dict) -> None:
        await workflow.execute_activity(
            ingest_episode,
            IngestEpisodeParams(
                episode_id=params["document_id"],
                content=params["content"],
                source_description=params.get("source_description", "document"),
                reference_time=params.get("reference_time"),
            ),
            **_ACTIVITY_OPTS,
        )


@workflow.defn(name="LinkEntitiesWorkflow")
class LinkEntitiesWorkflow:
    """Explicitly links two graph nodes with a typed relationship."""

    @workflow.run
    async def run(self, params: dict) -> None:
        await workflow.execute_activity(
            ingest_relationship,
            IngestRelationshipParams(
                from_id=params["from_id"],
                to_id=params["to_id"],
                relationship_type=params["relationship_type"],
                properties=params.get("properties"),
            ),
            **_ACTIVITY_OPTS,
        )
