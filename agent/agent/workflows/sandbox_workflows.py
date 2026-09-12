"""
Temporal workflows – sandbox execution.
Run on the sandbox-execution task queue.
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from agent.activities.sandbox_activities import (
        CollectArtifactsParams,
        RunSandboxTaskParams,
        collect_artifacts,
        run_sandbox_task,
    )

_ACTIVITY_OPTS = dict(
    start_to_close_timeout=timedelta(minutes=15),
    retry_policy=workflow.RetryPolicy(maximum_attempts=2),
)


@workflow.defn(name="ExecuteSandboxJobWorkflow")
class ExecuteSandboxJobWorkflow:
    """Runs an isolated sandbox task and persists its artifacts to MinIO."""

    @workflow.run
    async def run(self, params: dict) -> dict:
        task_result = await workflow.execute_activity(
            run_sandbox_task,
            RunSandboxTaskParams(
                job_id=params["job_id"],
                task_type=params["task_type"],
                payload=params.get("payload", {}),
            ),
            **_ACTIVITY_OPTS,
        )

        artifact_result = await workflow.execute_activity(
            collect_artifacts,
            CollectArtifactsParams(
                job_id=params["job_id"],
                task_output=asdict(task_result),
            ),
            **_ACTIVITY_OPTS,
        )

        return {"artifact_keys": artifact_result.artifact_keys}
