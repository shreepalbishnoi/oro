"""Founder-only ops (PLAN §14): freshness, lag, LLM use, check volume, dead letters."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import AdminUser, RedisDep, SessionDep
from app.llm.router import get_router
from app.models import Check, ErrorReport, Source

router = APIRouter(prefix="/v1/admin", tags=["admin"])


def _pct(values: list[int], q: float) -> int | None:
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, int(q * len(s)))]


@router.get("/ops")
async def ops(_: AdminUser, session: SessionDep, redis: RedisDep) -> dict:
    now = datetime.now(UTC)
    sources = (await session.scalars(select(Source).order_by(Source.slug))).all()
    lags = [int(x) for x in await redis.lrange("ops:lag_ms", 0, 999)]
    day_ago = now - timedelta(days=1)
    checks = dict(
        (
            await session.execute(
                select(Check.status, func.count())
                .where(Check.created_at >= day_ago)
                .group_by(Check.status)
            )
        ).all()
    )
    modes = dict(
        (
            await session.execute(
                select(Check.mode, func.count())
                .where(Check.created_at >= day_ago)
                .group_by(Check.mode)
            )
        ).all()
    )
    p95_check = await session.scalar(
        select(func.percentile_cont(0.95).within_group(Check.latency_ms)).where(
            Check.created_at >= day_ago, Check.status == "done"
        )
    )
    heartbeat = await redis.get("ops:poll_heartbeat")
    return {
        "at": now.isoformat(),
        "pipeline": {
            "pollerAliveSecondsAgo": int(now.timestamp()) - int(heartbeat) if heartbeat else None,
            "lagMsP50": _pct(lags, 0.5),
            "lagMsP95": _pct(lags, 0.95),
            "deadLetters": await redis.xlen("docs.dead"),
            "queued": await redis.xlen("docs.new"),
        },
        "sources": [
            {
                "slug": s.slug,
                "enabled": s.enabled,
                "lastOkAt": s.last_ok_at.isoformat() if s.last_ok_at else None,
                "minutesSinceOk": int((now - s.last_ok_at).total_seconds() // 60)
                if s.last_ok_at
                else None,
                "failCount": s.fail_count,
                "lastError": s.last_error,
                "items": s.items_total,
            }
            for s in sources
        ],
        "checks24h": {
            "byStatus": checks,
            "byMode": modes,
            "p95Ms": int(p95_check) if p95_check else None,
        },
        "openErrorReports": await session.scalar(
            select(func.count()).select_from(ErrorReport).where(ErrorReport.status == "open")
        ),
        "llm": await get_router(redis).usage_today(),
    }
