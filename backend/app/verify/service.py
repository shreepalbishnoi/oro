"""Check lifecycle: create → run assay in the background → publish events to a Redis Stream →
persist the verdict. SSE readers replay the stream, so reconnects (Last-Event-ID) lose nothing.

Privacy: the raw tip lives only in this task's memory. The database and Redis get the
PII-scrubbed text and hashes."""

import asyncio
import json
import logging
import secrets
import time
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import log_extra
from app.db.session import get_sessionmaker
from app.llm.router import LlmRouter
from app.models import Check
from app.verify import context as ctx
from app.verify import trail as tr
from app.verify.engine import AssayInput, run_assay
from app.verify.scrub import scrub
from app.verify.types import Verdict

logger = logging.getLogger(__name__)

STREAM_TTL_S = 3600
CACHE_WINDOW = timedelta(hours=6)
_tasks: set[asyncio.Task] = set()  # keep references so tasks aren't garbage-collected


def stream_key(public_id: str) -> str:
    return f"check:{public_id}:events"


def new_public_id() -> str:
    return secrets.token_urlsafe(12)


async def publish(redis: Redis, public_id: str, event: dict) -> None:
    key = stream_key(public_id)
    await redis.xadd(key, {"e": json.dumps(event, ensure_ascii=False, default=str)}, maxlen=500)
    await redis.expire(key, STREAM_TTL_S)


async def create_check(
    session: AsyncSession,
    raw: str,
    kind: str,
    channel: str,
    user_id: int | None,
    anon_key: str | None,
) -> Check:
    redacted, _ = scrub(raw)
    check = Check(
        public_id=new_public_id(),
        user_id=user_id,
        anon_key=anon_key,
        channel=channel,
        input_kind=kind,
        redacted_text=redacted,
        exact_hash=tr.exact_hash(raw),
        simhash=tr.to_signed(tr.simhash(raw)),
        status="pending",
    )
    session.add(check)
    await session.commit()
    return check


# Bump when scam rules or risk bands change, so cached verdicts from older rules are not replayed.
RULES_VERSION = "2026-11-14"


async def cached_verdict(session: AsyncSession, exact_hash: str, exclude_id: int) -> dict | None:
    """Identical text checked recently with fresh evidence: reuse at zero LLM cost."""
    since = datetime.now(UTC) - CACHE_WINDOW
    return await session.scalar(
        select(Check.verdict)
        .where(
            Check.exact_hash == exact_hash,
            Check.status == "done",
            Check.verdict["rules"].astext == RULES_VERSION,  # rule changes re-check old texts
            Check.created_at >= since,
            Check.id != exclude_id,
        )
        .order_by(Check.created_at.desc())
        .limit(1)
    )


def _replay_events(v: dict) -> list[dict]:
    """Rebuild the stage stream from a stored verdict (cache hit)."""
    out: list[dict] = [
        {"type": "stage", "stage": "scrub"},
        {
            "type": "scrubbed",
            "redacted": v["input"]["redacted"],
            "piiRemoved": v["input"]["piiRemoved"],
        },
        {"type": "stage", "stage": "signals"},
        *({"type": "signal", "signal": s} for s in v["signals"]),
        {"type": "stage", "stage": "claims"},
        {"type": "claims", "claims": v["claims"]},
        {"type": "stage", "stage": "evidence"},
        *({"type": "judgment", "judgment": j} for j in v["judgments"]),
        {"type": "trail", "trail": v.get("trail")},
    ]
    if v.get("otherSide"):
        out.append({"type": "otherSide", "items": v["otherSide"]})
    out += [
        {"type": "stage", "stage": "karat"},
        {"type": "karat", "karat": v["karat"], "parts": v["karatParts"], "risk": v["risk"]},
        {"type": "stage", "stage": "done"},
    ]
    return out


async def _execute(
    redis: Redis,
    router: LlmRouter | None,
    check_id: int,
    public_id: str,
    raw: str,
    kind: str,
    channel: str,
) -> None:
    started = time.perf_counter()
    sm = get_sessionmaker()
    try:
        async with sm() as session:
            await session.execute(
                update(Check).where(Check.id == check_id).values(status="running")
            )
            await session.commit()
            check = await session.get(Check, check_id)
            assert check is not None

            verdict_json: dict | None = await cached_verdict(session, check.exact_hash, check_id)
            if verdict_json is not None:
                trail = await ctx.record_trail(session, raw, channel)
                verdict_json = {**verdict_json, "trail": trail.dump() if trail else None}
                for e in _replay_events(verdict_json):
                    await publish(redis, public_id, e)
            else:
                inp = AssayInput(raw=raw, kind=kind, channel=channel, ref=public_id)  # type: ignore[arg-type]
                async for e in run_assay(session, router, inp):
                    if e["type"] == "verdict":
                        v: Verdict = e["verdict"]
                        verdict_json = v.dump()
                    else:
                        await publish(redis, public_id, e)
            assert verdict_json is not None
            verdict_json["rules"] = RULES_VERSION
            latency = int((time.perf_counter() - started) * 1000)
            await session.execute(
                update(Check)
                .where(Check.id == check_id)
                .values(
                    status="done",
                    verdict=verdict_json,
                    karat=verdict_json["karat"],
                    risk=verdict_json["risk"],
                    mode=verdict_json["mode"],
                    signal_ids=[s["id"] for s in verdict_json["signals"]],
                    latency_ms=latency,
                    finished_at=datetime.now(UTC),
                )
            )
            await session.commit()
        await publish(
            redis,
            public_id,
            {"type": "done", "verdict": verdict_json, "checkId": public_id, "slug": None},
        )
        logger.info(
            "check done", extra=log_extra(check=public_id, ms=latency, mode=verdict_json["mode"])
        )
    except Exception:
        logger.exception("check failed", extra=log_extra(check=public_id))
        try:
            async with sm() as session:
                await session.execute(
                    update(Check)
                    .where(Check.id == check_id)
                    .values(status="failed", finished_at=datetime.now(UTC))
                )
                await session.commit()
        finally:
            await publish(
                redis, public_id, {"type": "error", "message": "The check failed. Try again."}
            )


def start_check(
    redis: Redis, router: LlmRouter | None, check: Check, raw: str, kind: str, channel: str
) -> None:
    task = asyncio.create_task(
        _execute(redis, router, check.id, check.public_id, raw, kind, channel)
    )
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def fail_stale_checks(
    session: AsyncSession, older_than: timedelta = timedelta(minutes=5)
) -> int:
    """A process restart can orphan running checks; mark them failed (run from beat)."""
    cutoff = datetime.now(UTC) - older_than
    res = await session.execute(
        update(Check)
        .where(Check.status.in_(("pending", "running")), Check.created_at < cutoff)
        .values(status="failed", finished_at=datetime.now(UTC))
    )
    await session.commit()
    return res.rowcount or 0
