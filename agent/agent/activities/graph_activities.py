"""
Temporal activities – graph ingestion (Neo4j / Graphiti).
These run inside the graph-ingestion worker.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from temporalio import activity

from agent.graph import get_graphiti, _get_driver
from agent.logger import log


@dataclass
class IngestEpisodeParams:
    episode_id: str
    content: str
    source_description: str
    # ISO-8601 timestamp string
    reference_time: str | None = None


@dataclass
class IngestNodeParams:
    node_id: str
    label: str
    properties: dict[str, Any]


@dataclass
class IngestRelationshipParams:
    from_id: str
    to_id: str
    relationship_type: str
    properties: dict[str, Any] | None = None


@activity.defn(name="ingest_episode")
async def ingest_episode(params: IngestEpisodeParams) -> None:
    """
    Ingest a text episode into the Graphiti knowledge graph.
    Graphiti will extract entities and relationships automatically.
    """
    from datetime import datetime

    graphiti = await get_graphiti()
    ref_time = (
        datetime.fromisoformat(params.reference_time)
        if params.reference_time
        else datetime.utcnow()
    )
    await graphiti.add_episode(
        name=params.episode_id,
        episode_body=params.content,
        source_description=params.source_description,
        reference_time=ref_time,
    )
    log.info("graph.episode_ingested", episode_id=params.episode_id)


@activity.defn(name="ingest_node")
async def ingest_node(params: IngestNodeParams) -> None:
    """Upsert a raw node into Neo4j (bypass Graphiti for pre-structured data)."""
    driver = _get_driver()
    async with driver.session() as session:
        await session.run(
            f"MERGE (n:`{params.label}` {{id: $id}}) SET n += $props",
            id=params.node_id,
            props=params.properties,
        )
    log.info("graph.node_ingested", node_id=params.node_id, label=params.label)


@activity.defn(name="ingest_relationship")
async def ingest_relationship(params: IngestRelationshipParams) -> None:
    """Create a relationship between two existing nodes."""
    driver = _get_driver()
    props = params.properties or {}
    async with driver.session() as session:
        await session.run(
            f"""
            MATCH (a {{id: $from_id}}), (b {{id: $to_id}})
            MERGE (a)-[r:`{params.relationship_type}`]->(b)
            SET r += $props
            """,
            from_id=params.from_id,
            to_id=params.to_id,
            props=props,
        )
    log.info(
        "graph.relationship_ingested",
        from_id=params.from_id,
        to_id=params.to_id,
        rel=params.relationship_type,
    )
