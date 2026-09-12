"""
Neo4j / Graphiti client helpers.
Provides a singleton GraphitiClient and a raw Neo4j driver for migrations.
"""
from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Any

from graphiti_core import Graphiti
from neo4j import AsyncGraphDatabase, AsyncDriver

from agent.config import settings
from agent.logger import log


@lru_cache(maxsize=1)
def _get_driver() -> AsyncDriver:
    return AsyncGraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )


async def get_graphiti() -> Graphiti:
    """Return a ready Graphiti client backed by Neo4j."""
    client = Graphiti(
        neo4j_uri=settings.neo4j_uri,
        neo4j_user=settings.neo4j_user,
        neo4j_password=settings.neo4j_password,
    )
    # Build indices on first use (idempotent)
    await client.build_indices_and_constraints()
    return client


async def check_neo4j() -> None:
    """Lightweight liveness check used by health probes."""
    driver = _get_driver()
    async with driver.session() as session:
        await session.run("RETURN 1")
    log.debug("neo4j.ok")


async def close_driver() -> None:
    driver = _get_driver()
    await driver.close()
    _get_driver.cache_clear()
