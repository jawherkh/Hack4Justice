"""
Neo4j graph migration script.
Applies constraints and indexes required by Graphiti.

Run:
    python -m agent.scripts.graph_migrate
"""
import asyncio

from agent.graph import _get_driver, get_graphiti, close_driver
from agent.logger import log

# Raw Cypher constraints/indexes applied before Graphiti's own setup
_CONSTRAINTS = [
    "CREATE CONSTRAINT subject_id IF NOT EXISTS FOR (n:Subject) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT document_id IF NOT EXISTS FOR (n:Document) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE",
]

_INDEXES = [
    "CREATE INDEX subject_name IF NOT EXISTS FOR (n:Subject) ON (n.name)",
    "CREATE INDEX document_created IF NOT EXISTS FOR (n:Document) ON (n.createdAt)",
]


async def main() -> None:
    log.info("graph_migrate.start")

    # 1. Raw constraints / indexes
    driver = _get_driver()
    async with driver.session() as session:
        for stmt in _CONSTRAINTS + _INDEXES:
            await session.run(stmt)
            log.info("graph_migrate.applied", stmt=stmt)

    # 2. Let Graphiti create its own indices / constraints
    log.info("graph_migrate.graphiti_indices")
    graphiti = await get_graphiti()
    await graphiti.build_indices_and_constraints()

    await close_driver()
    log.info("graph_migrate.complete")


if __name__ == "__main__":
    asyncio.run(main())
