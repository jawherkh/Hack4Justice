"""MinIO client helper."""
from __future__ import annotations

from functools import lru_cache

from minio import Minio

from agent.config import settings
from agent.logger import log


@lru_cache(maxsize=1)
def get_minio() -> Minio:
    return Minio(
        f"{settings.minio_endpoint}:{settings.minio_port}",
        access_key=settings.minio_root_user,
        secret_key=settings.minio_root_password,
        secure=settings.minio_use_ssl,
    )


async def check_minio() -> None:
    """Liveness check — verifies the documents bucket is reachable."""
    client = get_minio()
    client.bucket_exists(settings.minio_bucket_documents)
    log.debug("minio.ok")


def put_object_bytes(bucket: str, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    import io
    client = get_minio()
    client.put_object(bucket, key, io.BytesIO(data), len(data), content_type=content_type)
