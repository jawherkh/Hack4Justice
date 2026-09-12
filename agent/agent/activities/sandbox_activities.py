"""
Temporal activities – sandbox execution.
These run inside the sandbox-execution worker.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from temporalio import activity

from agent.storage import get_minio, put_object_bytes
from agent.config import settings
from agent.logger import log


@dataclass
class RunSandboxTaskParams:
    job_id: str
    task_type: str
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class CollectArtifactsParams:
    job_id: str
    task_output: dict[str, Any]


@dataclass
class SandboxTaskResult:
    job_id: str
    task_type: str
    # Serialisable result data
    result: dict[str, Any]


@dataclass
class ArtifactsResult:
    artifact_keys: list[str]


@activity.defn(name="run_sandbox_task")
async def run_sandbox_task(params: RunSandboxTaskParams) -> SandboxTaskResult:
    """
    Execute an isolated sandbox task.
    Replace the stub below with real subprocess / container invocation.
    """
    log.info(
        "sandbox.task_started",
        job_id=params.job_id,
        task_type=params.task_type,
    )

    # TODO: replace with real sandbox execution logic
    result: dict[str, Any] = {
        "job_id": params.job_id,
        "task_type": params.task_type,
        "status": "completed",
        "output": "stub",
    }

    log.info("sandbox.task_finished", job_id=params.job_id)
    return SandboxTaskResult(
        job_id=params.job_id,
        task_type=params.task_type,
        result=result,
    )


@activity.defn(name="collect_artifacts")
async def collect_artifacts(params: CollectArtifactsParams) -> ArtifactsResult:
    """Store task output in MinIO and return the storage key."""
    bucket = settings.minio_bucket_sandbox
    key = f"jobs/{params.job_id}/output.json"
    data = json.dumps(params.task_output, indent=2).encode()

    put_object_bytes(bucket, key, data, content_type="application/json")
    log.info("sandbox.artifacts_collected", key=key)
    return ArtifactsResult(artifact_keys=[key])
