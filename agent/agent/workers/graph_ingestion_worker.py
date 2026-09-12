"""
Worker: graph-ingestion
Connects to Temporal and polls the graph-ingestion task queue.

Run locally:
    python -m agent.workers.graph_ingestion_worker

Via Docker Compose:
    docker compose up worker-graph
"""
import asyncio

from temporalio.client import Client
from temporalio.worker import Worker

from agent.config import settings
from agent.logger import log
from agent.activities.graph_activities import (
    ingest_episode,
    ingest_node,
    ingest_relationship,
)
from agent.workflows.graph_workflows import (
    IngestDocumentWorkflow,
    LinkEntitiesWorkflow,
)


async def main() -> None:
    client = await Client.connect(
        settings.temporal_address,
        namespace=settings.temporal_namespace,
    )

    async with Worker(
        client,
        task_queue=settings.queue_graph_ingestion,
        workflows=[IngestDocumentWorkflow, LinkEntitiesWorkflow],
        activities=[ingest_episode, ingest_node, ingest_relationship],
    ):
        log.info(
            "worker.started",
            queue=settings.queue_graph_ingestion,
            service="graph-ingestion",
        )
        # Run until cancelled
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
