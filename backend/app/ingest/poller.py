"""Adaptive pollers (PLAN §7 poller rules): one client per source, conditional GET,
high-water mark, per-source circuit breaker with jittered backoff, freshness tracking.
New documents are announced on the `docs.new` Redis Stream for the pipeline."""

import logging
import random
from datetime import UTC, datetime, time, timedelta

import httpx
from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import log_extra
from app.ingest import feeds
from app.ingest.disclosures import ingest_insider_items
from app.ingest.http import make_client
from app.ingest.sources import by_slug
from app.models import Source
from app.pipeline.store import RawItem, store_item

logger = logging.getLogger(__name__)

DOCS_STREAM = "docs.new"
OVERLAP = timedelta(minutes=10)  # exchanges sometimes publish items slightly out of order
MAX_BACKOFF_S = 3600

PARSERS = {
    "nse": feeds.parse_nse_announcements,
    "bse": feeds.parse_bse_announcements,
    "rss": feeds.parse_rss,
    "insider": feeds.parse_nse_announcements,  # same RSS shape; items link to XBRL files
}


def market_hours(now: datetime) -> bool:
    ist = now.astimezone(feeds.IST)
    return ist.weekday() < 5 and time(9, 0) <= ist.time() <= time(16, 0)


def next_interval(src: Source, now: datetime) -> int:
    base = src.poll_market_s if market_hours(now) else src.poll_off_s
    return int(base * (0.9 + random.random() * 0.2))  # noqa: S311 - jitter, not crypto


async def poll_source(
    session: AsyncSession, redis: Redis, client: httpx.AsyncClient, src: Source
) -> int:
    """Polls one source. Returns the number of new documents."""
    now = datetime.now(UTC)
    d = by_slug(src.slug)
    parser_key = d.parser if d else "rss"
    headers = {}
    if src.etag:
        headers["If-None-Match"] = src.etag
    if src.last_modified:
        headers["If-Modified-Since"] = src.last_modified
    try:
        resp = await client.get(src.url, headers=headers)
        if resp.status_code == 304:
            await _ok(session, src, now, 0)
            return 0
        resp.raise_for_status()
        items: list[RawItem] = PARSERS[parser_key](resp.content)
    except Exception as exc:  # noqa: BLE001 - a broken source must never stop the others
        await _fail(session, src, now, f"{type(exc).__name__}: {str(exc)[:200]}")
        return 0

    floor = (src.high_water - OVERLAP) if src.high_water else None
    fresh = [i for i in items if floor is None or i.published_at >= floor]
    new_ids: list[int] = []
    if parser_key == "insider":
        await ingest_insider_items(session, client, fresh)
    else:
        for item in fresh:
            doc_id = await store_item(session, src.id, src.tier, item)
            if doc_id:
                new_ids.append(doc_id)
    hw = max((i.published_at for i in items), default=src.high_water)
    src.etag = resp.headers.get("etag")
    src.last_modified = resp.headers.get("last-modified")
    src.high_water = max(hw, src.high_water) if (hw and src.high_water) else hw
    await _ok(session, src, now, len(new_ids))
    for doc_id in new_ids:
        await redis.xadd(DOCS_STREAM, {"doc_id": str(doc_id)}, maxlen=100_000, approximate=True)
    if new_ids:
        logger.info("new documents", extra=log_extra(source=src.slug, count=len(new_ids)))
    return len(new_ids)


async def _ok(session: AsyncSession, src: Source, now: datetime, n: int) -> None:
    src.last_ok_at = now
    src.fail_count = 0
    src.last_error = None
    src.items_total = (src.items_total or 0) + n
    src.next_poll_at = now + timedelta(seconds=next_interval(src, now))
    await session.commit()


async def _fail(session: AsyncSession, src: Source, now: datetime, err: str) -> None:
    fails = (src.fail_count or 0) + 1
    backoff = min(MAX_BACKOFF_S, next_interval(src, now) * 2 ** min(fails, 6))
    await session.execute(
        update(Source)
        .where(Source.id == src.id)
        .values(fail_count=fails, last_error=err, next_poll_at=now + timedelta(seconds=backoff))
    )
    await session.commit()
    logger.warning("source failed", extra=log_extra(source=src.slug, fails=fails, err=err))


async def poll_due(
    session: AsyncSession, redis: Redis, client: httpx.AsyncClient | None = None
) -> int:
    now = datetime.now(UTC)
    due = (
        await session.scalars(
            select(Source).where(
                Source.enabled.is_(True),
                Source.kind == "rss",
                (Source.next_poll_at.is_(None)) | (Source.next_poll_at <= now),
            )
        )
    ).all()
    if not due:
        return 0
    own = client is None
    client = client or make_client()
    try:
        total = 0
        for src in due:
            total += await poll_source(session, redis, client, src)
        return total
    finally:
        if own:
            await client.aclose()
