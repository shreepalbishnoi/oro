"""Pipeline service: `python -m app.pipeline.service`. One asyncio process (PLAN §6.3, 400 MB).

- poll loop: polls due sources every few seconds (each source paces itself).
- consume loop: reads `docs.new` with a consumer group; per document: PDF text (if worth
  reading) → entity link → chunk → embed → index → fan out to Room feeds → ack.
  Messages idle > 5 min are reclaimed (crash recovery); after 3 failures a message moves to
  `docs.dead` for the admin replay action.
- backfill loop: embeds chunks stored while the embedding service was down.
Freshness (publish → processed) is recorded for the ops dashboard."""

import asyncio
import logging
import os
import signal
import socket
import time
from datetime import UTC, datetime

from redis.asyncio import Redis
from redis.exceptions import ResponseError
from sqlalchemy import update

from app.core.config import get_settings
from app.core.logging import configure_logging, log_extra
from app.core.redis import close_redis, get_blocking_redis, get_redis
from app.db.session import dispose_engine, get_sessionmaker
from app.ingest import pdf
from app.ingest.http import make_client
from app.ingest.poller import DOCS_STREAM, poll_due
from app.ingest.sources import sync_catalogue
from app.models import Document
from app.pipeline.store import backfill_embeddings, process_document
from app.room.feed import fanout

logger = logging.getLogger("pipeline")

GROUP = "pipeline"
DEAD = "docs.dead"
MAX_ATTEMPTS = 3
LAG_KEY = "ops:lag_ms"


async def ensure_group(redis: Redis) -> None:
    try:
        await redis.xgroup_create(DOCS_STREAM, GROUP, id="0", mkstream=True)
    except ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def handle(redis: Redis, client, doc_id: int) -> None:  # type: ignore[no-untyped-def]
    sm = get_sessionmaker()
    async with sm() as session:
        doc = await session.get(Document, doc_id)
        if doc is None or doc.processed_at is not None:
            return
        if (
            doc.tier == 1
            and doc.url.lower().endswith(".pdf")
            and pdf.worth_reading(doc.title, doc.category)
        ):
            body = await pdf.extract(client, doc.url)
            if body:
                await session.execute(
                    update(Document)
                    .where(Document.id == doc_id)
                    .values(body=f"{doc.body}\n\n{body}".strip())
                )
                await session.flush()
                session.expire(doc)
        ids = await process_document(session, doc_id)
        await session.commit()
        await fanout(session, redis, doc_id, ids)
        lag = int((datetime.now(UTC) - doc.published_at).total_seconds() * 1000)
        await redis.lpush(LAG_KEY, lag)
        await redis.ltrim(LAG_KEY, 0, 999)


async def consume_loop(redis: Redis, stop: asyncio.Event) -> None:
    await ensure_group(redis)
    me = f"{socket.gethostname()}-{os.getpid()}"
    client = make_client()
    try:
        while not stop.is_set():
            # Reclaim work orphaned by a crashed consumer.
            _, claimed, *_ = await redis.xautoclaim(
                DOCS_STREAM, GROUP, me, min_idle_time=300_000, count=10
            )
            batch = [(DOCS_STREAM, claimed)] if claimed else []
            if not batch:
                batch = (
                    await redis.xreadgroup(GROUP, me, {DOCS_STREAM: ">"}, count=10, block=5000)
                    or []
                )
            for _, entries in batch:
                for msg_id, fields in entries:
                    if not fields:
                        await redis.xack(DOCS_STREAM, GROUP, msg_id)
                        continue
                    try:
                        await handle(redis, client, int(fields["doc_id"]))
                        await redis.xack(DOCS_STREAM, GROUP, msg_id)
                    except Exception as exc:  # noqa: BLE001
                        tries = await redis.hincrby("docs.attempts", msg_id, 1)
                        logger.exception(
                            "document failed",
                            extra=log_extra(doc=fields.get("doc_id"), tries=tries),
                        )
                        if tries >= MAX_ATTEMPTS:
                            await redis.xadd(
                                DEAD, {**fields, "error": type(exc).__name__}, maxlen=10_000
                            )
                            await redis.xack(DOCS_STREAM, GROUP, msg_id)
                            await redis.hdel("docs.attempts", msg_id)
    finally:
        await client.aclose()


async def poll_loop(redis: Redis, stop: asyncio.Event) -> None:
    sm = get_sessionmaker()
    async with sm() as session:
        await sync_catalogue(session)
    client = make_client()
    try:
        while not stop.is_set():
            started = time.perf_counter()
            try:
                async with sm() as session:
                    await poll_due(session, redis, client)
            except Exception:  # noqa: BLE001
                logger.exception("poll cycle failed")
            await redis.set("ops:poll_heartbeat", int(time.time()))
            await asyncio.sleep(max(1.0, 5.0 - (time.perf_counter() - started)))
    finally:
        await client.aclose()


async def backfill_loop(stop: asyncio.Event) -> None:
    sm = get_sessionmaker()
    while not stop.is_set():
        try:
            async with sm() as session:
                n = await backfill_embeddings(session)
        except Exception:  # noqa: BLE001
            logger.exception("embedding backfill failed")
            n = 0
        await asyncio.sleep(1 if n else 60)


async def supervise(name: str, run, stop: asyncio.Event, base_delay: float = 2.0) -> None:  # type: ignore[no-untyped-def]
    """Keeps a loop alive: a crash (DB restart, Redis blip) is logged and the loop restarts with
    backoff, instead of the task dying silently while the rest of the service looks healthy."""
    delay = base_delay
    while not stop.is_set():
        try:
            await run()
            return
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("loop crashed; restarting", extra=log_extra(loop=name, in_s=delay))
            try:
                await asyncio.wait_for(stop.wait(), timeout=delay)
            except TimeoutError:
                pass
            delay = min(delay * 2, 60.0)


async def main() -> None:
    configure_logging(get_settings().log_level)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows dev
            pass
    redis = get_redis()
    logger.info("pipeline starting")
    tasks = [
        asyncio.create_task(supervise("poll", lambda: poll_loop(redis, stop), stop)),
        asyncio.create_task(
            supervise("consume", lambda: consume_loop(get_blocking_redis(), stop), stop)
        ),
        asyncio.create_task(supervise("backfill", lambda: backfill_loop(stop), stop)),
    ]
    try:
        await stop.wait()
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await close_redis()
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
