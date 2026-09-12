"""
Worker: sandbox-execution
Connects to Temporal and polls the sandbox-execution task queue.

Run locally:
    python -m agent.workers.sandbox_execution_worker

Via Docker Compose:
    docker compose up worker-sandbox
"""
import asyncio

from temporalio.client import Client
from temporalio.worker import Worker

from agent.config import settings
from agent.logger import log
from agent.activities.sandbox_activities import run_sandbox_task, collect_artifacts
from agent.workflows.sandbox_workflows import ExecuteSandboxJobWorkflow


async def main() -> None:
    client = await Client.connect(
        settings.temporal_address,
        namespace=settings.temporal_namespace,
    )

    async with Worker(
        client,
        task_queue=settings.queue_sandbox_execution,
        workflows=[ExecuteSandboxJobWorkflow],
        activities=[run_sandbox_task, collect_artifacts],
        # Limit concurrency — sandbox tasks can be resource-intensive
        max_concurrent_activity_task_executions=5,
        max_concurrent_workflow_task_executions=5,
    ):
        log.info(
            "worker.started",
            queue=settings.queue_sandbox_execution,
            service="sandbox-execution",
        )
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
