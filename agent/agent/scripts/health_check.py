"""
Agent health check script.
Verifies Neo4j and MinIO connectivity.

Run:
    python -m agent.scripts.health_check
Exit 0 = all healthy, Exit 1 = one or more failed.
"""
import asyncio
import sys

from agent.graph import check_neo4j
from agent.storage import check_minio


async def main() -> None:
    print("\n🔍  hack4justice – Agent health check\n")

    checks = [
        ("Neo4j",  check_neo4j()),
        ("MinIO",  check_minio()),
    ]

    results: list[tuple[str, bool, str]] = []
    for name, coro in checks:
        try:
            await coro
            results.append((name, True, ""))
        except Exception as exc:
            results.append((name, False, str(exc)))

    all_ok = True
    for name, ok, err in results:
        icon = "✅" if ok else "❌"
        msg = "OK" if ok else err
        print(f"  {icon}  {name:<12} {msg}")
        if not ok:
            all_ok = False

    print()
    if all_ok:
        print("All agent services healthy ✅\n")
        sys.exit(0)
    else:
        print("One or more agent services are unavailable ❌\n")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
