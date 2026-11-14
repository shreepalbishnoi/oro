"""Celery app for scheduled batch jobs. Start with:
    celery -A app.worker worker -l info --concurrency 2
    celery -A app.worker beat -l info
Real-time work (polling, document processing) lives in app.pipeline.service instead."""

import asyncio
from collections.abc import Awaitable, Callable

from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings
from app.core.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level)

celery_app = Celery("oro", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_acks_late=True,  # redeliver if a worker dies mid-task; tasks must be idempotent
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_time_limit=30 * 60,
    task_soft_time_limit=25 * 60,
    result_expires=3600,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        # Exchanges publish bhavcopy, index closes and deal files by ~18:30 IST.
        "eod-prices": {
            "task": "eod.prices",
            "schedule": crontab(hour=18, minute=45, day_of_week="mon-fri"),
        },
        "deals": {
            "task": "disclosures.deals",
            "schedule": crontab(hour=18, minute=50, day_of_week="mon-fri"),
        },
        # AMFI NAVs by ~23:00 IST; the instrument master the same night.
        "navs": {"task": "eod.navs", "schedule": crontab(hour=23, minute=15)},
        "instrument-master-nightly": {
            "task": "reference.refresh_instruments",
            "schedule": crontab(hour=23, minute=30),
        },
        "sebi-register-weekly": {
            "task": "reference.sebi_register",
            "schedule": crontab(hour=3, minute=0, day_of_week="sun"),
        },
        "stale-checks": {"task": "ops.fail_stale_checks", "schedule": crontab(minute="*/5")},
    },
)


def run(factory: Callable[[], Awaitable[object]]) -> object:
    """Each task gets a fresh event loop and DB engine (Celery workers are sync)."""
    from app.db.session import dispose_engine

    async def wrapped() -> object:
        try:
            return await factory()
        finally:
            await dispose_engine()

    return asyncio.run(wrapped())


RETRY = {
    "autoretry_for": (Exception,),
    "retry_backoff": 60,
    "retry_backoff_max": 900,
    "max_retries": 4,
}


@celery_app.task(name="reference.refresh_instruments", **RETRY)
def refresh_instruments() -> object:
    from app.ingest.reference.instruments import load_all

    return run(load_all)


def _with_session_and_client(fn):  # type: ignore[no-untyped-def]
    async def go() -> object:
        from app.db.session import get_sessionmaker
        from app.ingest.http import make_client

        async with get_sessionmaker()() as session, make_client() as client:
            return await fn(session, client)

    return go


@celery_app.task(name="eod.prices", **RETRY)
def eod_prices() -> object:
    from app.ingest.eod import fetch_eod

    return run(_with_session_and_client(fetch_eod))


@celery_app.task(name="eod.navs", **RETRY)
def eod_navs() -> object:
    from app.ingest.eod import NAV_URL, load_navs, parse_nav
    from app.ingest.http import get_with_retry

    async def go(session, client):  # type: ignore[no-untyped-def]
        resp = await get_with_retry(client, NAV_URL)
        resp.raise_for_status()
        return {"navs": await load_navs(session, parse_nav(resp.text))}

    return run(_with_session_and_client(go))


@celery_app.task(name="disclosures.deals", **RETRY)
def deals() -> object:
    from app.ingest.disclosures import fetch_deals

    return run(_with_session_and_client(fetch_deals))


@celery_app.task(
    name="reference.sebi_register", autoretry_for=(Exception,), retry_backoff=3600, max_retries=2
)
def sebi_register() -> object:
    from app.ingest.sebi_registry import refresh

    async def go(session, client):  # type: ignore[no-untyped-def]
        return {"RA": await refresh(session, client, 14), "IA": await refresh(session, client, 13)}

    return run(_with_session_and_client(go))


@celery_app.task(name="ops.fail_stale_checks")
def fail_stale_checks() -> object:
    from app.db.session import get_sessionmaker
    from app.verify.service import fail_stale_checks as sweep

    async def go() -> int:
        async with get_sessionmaker()() as session:
            return await sweep(session)

    return run(go)
