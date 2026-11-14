import asyncio
import time

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.core.redis import get_redis
from app.db.session import get_engine

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


async def _check_db() -> float:
    start = time.perf_counter()
    async with get_engine().connect() as conn:
        await conn.execute(text("SELECT 1"))
    return (time.perf_counter() - start) * 1000


async def _check_redis() -> float:
    start = time.perf_counter()
    await get_redis().ping()
    return (time.perf_counter() - start) * 1000


@router.get("/readyz")
async def readiness(response: Response) -> dict[str, object]:
    results: dict[str, object] = {}
    ok = True
    for name, check in (("postgres", _check_db), ("redis", _check_redis)):
        try:
            ms = await asyncio.wait_for(check(), timeout=2.0)
            results[name] = {"ok": True, "ms": round(ms, 1)}
        except Exception as exc:  # noqa: BLE001 - readiness must report, not raise
            ok = False
            results[name] = {"ok": False, "error": type(exc).__name__}
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if ok else "degraded", "checks": results}
