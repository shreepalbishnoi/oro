"""Room feed (PLAN §6.2, §9.4): fan-out on write, cheap reads.

A processed document that names an instrument is pushed to every user exposed to it, directly
or through a fund's latest disclosed portfolio. Each user's feed is a Redis sorted set scored
by recency plus a priority bonus; story cards are Redis hashes. Reads never join or call an LLM.
Routine filings (newspaper copies, trading-window notices) are indexed for search but not fanned out."""

import json
import re
import time
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, Source

FEED_MAX = 500
TTL_S = 30 * 86400
ROUTINE = re.compile(
    r"newspaper publication|trading window|loss of share certificate|duplicate share|"
    r"certificate under reg(ulation)? 74|74\(5\)|compliance certificate|investor complaints|"
    r"closure of trading|change in (registered office )?address|ncd interest|"
    r"statement of deviation|book closure|shareholding pattern",
    re.I,
)
HIGH_SIGNAL = re.compile(
    r"clarification|pledge|resign|auditor|default|insolvency|sebi order|fraud|rating|"
    r"acqui|merger|order|award|result|dividend|bonus|buyback",
    re.I,
)


def priority_bonus_s(doc: Document, direct: bool, weight: float) -> float:
    """Extra seconds of 'freshness': tier-1, high-signal and direct holdings float up."""
    bonus = 0.0
    if doc.tier <= 2:
        bonus += 3 * 3600
    if HIGH_SIGNAL.search(f"{doc.title} {doc.category or ''}"):
        bonus += 6 * 3600
    if doc.denies:
        bonus += 6 * 3600
    bonus += 6 * 3600 if direct else 12 * 3600 * min(1.0, weight * 10)
    return bonus


def is_routine(doc: Document) -> bool:
    return bool(ROUTINE.search(f"{doc.title} {doc.category or ''}"))


async def exposed_users(
    session: AsyncSession, instrument_ids: list[int]
) -> dict[int, tuple[bool, float]]:
    """user_id -> (holds directly, max fund weight)."""
    rows = await session.execute(
        text(
            """
            SELECT h.user_id, bool_or(h.instrument_id = ANY(:ids)) AS direct, max(coalesce(fp.weight, 0)) AS w
            FROM holdings h
            LEFT JOIN fund_portfolios fp
              ON fp.scheme_id = h.instrument_id AND fp.instrument_id = ANY(:ids)
             AND fp.as_of = (SELECT max(as_of) FROM fund_portfolios f2 WHERE f2.scheme_id = h.instrument_id)
            WHERE h.instrument_id = ANY(:ids) OR fp.scheme_id IS NOT NULL
            GROUP BY h.user_id
            """
        ),
        {"ids": instrument_ids},
    )
    return {r.user_id: (bool(r.direct), float(r.w or 0)) for r in rows}


async def story_card(
    session: AsyncSession, doc: Document, instrument_ids: list[int]
) -> dict[str, str]:
    src = await session.get(Source, doc.source_id)
    syms = []
    if instrument_ids:
        rows = await session.execute(
            text("SELECT coalesce(nse_symbol, bse_code) FROM instruments WHERE id = ANY(:ids)"),
            {"ids": instrument_ids},
        )
        syms = [r[0] for r in rows if r[0]]
    return {
        "id": str(doc.id),
        "title": doc.title[:300],
        "summary": doc.body[:400],
        "url": doc.url,
        "source": src.name if src else "",
        "tier": str(doc.tier),
        "publishedAt": doc.published_at.isoformat(),
        "denies": "1" if doc.denies else "0",
        "instrumentIds": json.dumps(instrument_ids),
        "symbols": json.dumps(syms),
        "category": doc.category or "",
    }


async def fanout(
    session: AsyncSession, redis: Redis, doc_id: int, instrument_ids: list[int]
) -> int:
    if not instrument_ids:
        return 0
    doc = await session.get(Document, doc_id)
    if doc is None or is_routine(doc):
        return 0
    users = await exposed_users(session, instrument_ids)
    if not users:
        return 0
    card = await story_card(session, doc, instrument_ids)
    pipe = redis.pipeline()
    pipe.hset(f"story:{doc.id}", mapping=card)
    pipe.expire(f"story:{doc.id}", TTL_S)
    base = doc.published_at.timestamp()
    for uid, (direct, w) in users.items():
        key = f"feed:{uid}"
        # Idempotent: re-delivery overwrites the same member with the same score.
        pipe.zadd(key, {str(doc.id): base + priority_bonus_s(doc, direct, w)})
        pipe.zremrangebyrank(key, 0, -FEED_MAX - 1)
        pipe.expire(key, TTL_S)
        pipe.publish(f"feed:{uid}:live", str(doc.id))
    await pipe.execute()
    # Only fresh documents alert (backfills and re-deliveries of old filings never do).
    if time.time() - base < 6 * 3600:
        from app.alerts import push  # local import: alerts depend on models, not the other way

        await push.notify(session, redis, doc, users, json.loads(card["symbols"]))
    return len(users)


async def backfill_user(
    session: AsyncSession, redis: Redis, user_id: int, days: int = 14, limit: int = 200
) -> int:
    """Fan-out is on write, so a new import would start with an empty feed. Deliver the last
    `days` of non-routine documents that touch the user's holdings (direct or via a fund's
    latest disclosed portfolio) the same way fanout() would have."""
    rows = (
        await session.execute(
            text(
                """
                WITH held AS (SELECT DISTINCT instrument_id FROM holdings WHERE user_id = :u),
                reach AS (
                  SELECT instrument_id, true AS direct, 0::float AS w FROM held
                  UNION ALL
                  SELECT fp.instrument_id, false, fp.weight::float
                  FROM fund_portfolios fp JOIN held ON held.instrument_id = fp.scheme_id
                  WHERE fp.as_of = (SELECT max(as_of) FROM fund_portfolios f2 WHERE f2.scheme_id = fp.scheme_id)
                )
                SELECT d.id, bool_or(r.direct) AS direct, max(r.w) AS w,
                       array_agg(DISTINCT de.instrument_id) AS ids
                FROM documents d
                JOIN doc_entities de ON de.document_id = d.id
                JOIN reach r ON r.instrument_id = de.instrument_id
                WHERE d.published_at > now() - make_interval(days => :days)
                GROUP BY d.id
                ORDER BY max(d.published_at) DESC
                LIMIT :lim
                """
            ),
            {"u": user_id, "days": days, "lim": limit},
        )
    ).all()
    if not rows:
        return 0
    docs = {
        d.id: d
        for d in (
            await session.scalars(select(Document).where(Document.id.in_([r.id for r in rows])))
        )
    }
    pipe = redis.pipeline()
    n = 0
    for r in rows:
        doc = docs.get(r.id)
        if doc is None or is_routine(doc):
            continue
        card = await story_card(session, doc, list(r.ids))
        pipe.hset(f"story:{doc.id}", mapping=card)
        pipe.expire(f"story:{doc.id}", TTL_S)
        score = doc.published_at.timestamp() + priority_bonus_s(
            doc, bool(r.direct), float(r.w or 0)
        )
        pipe.zadd(f"feed:{user_id}", {str(doc.id): score})
        n += 1
    pipe.zremrangebyrank(f"feed:{user_id}", 0, -FEED_MAX - 1)
    pipe.expire(f"feed:{user_id}", TTL_S)
    await pipe.execute()
    return n


async def read_feed(
    session: AsyncSession, redis: Redis, user_id: int, cursor: float | None, limit: int = 20
) -> tuple[list[dict], float | None]:
    key = f"feed:{user_id}"
    hi = f"({cursor}" if cursor is not None else "+inf"
    pairs = await redis.zrevrangebyscore(key, hi, "-inf", start=0, num=limit + 1, withscores=True)
    page, more = pairs[:limit], len(pairs) > limit
    dismissed = await redis.smembers(f"feed:{user_id}:dismissed")
    read = await redis.smembers(f"feed:{user_id}:read")
    pipe = redis.pipeline()
    for member, _ in page:
        pipe.hgetall(f"story:{member}")
    cards = await pipe.execute()
    out: list[dict] = []
    for (member, score), card in zip(page, cards, strict=True):
        if member in dismissed:
            continue
        if not card:  # story hash expired: rebuild from Postgres
            doc = await session.get(Document, int(member))
            if doc is None:
                continue
            ids = list(
                (
                    await session.scalars(
                        text(
                            "SELECT instrument_id FROM doc_entities WHERE document_id = :d"
                        ).bindparams(d=doc.id)
                    )
                ).all()
            )
            card = await story_card(session, doc, ids)
        out.append(_public(card, read=member in read, score=score))
    next_cursor = page[-1][1] if (page and more) else None
    return out, next_cursor


def _public(card: dict, *, read: bool, score: float) -> dict:
    return {
        "id": card["id"],
        "title": card["title"],
        "summary": card.get("summary", ""),
        "url": card["url"],
        "source": card.get("source", ""),
        "tier": int(card.get("tier", 4)),
        "publishedAt": card["publishedAt"],
        "deniesRumour": card.get("denies") == "1",
        "symbols": json.loads(card.get("symbols") or "[]"),
        "instrumentIds": json.loads(card.get("instrumentIds") or "[]"),
        "read": read,
        "rank": score,
    }


async def since_last_came(
    session: AsyncSession, redis: Redis, user_id: int, last_seen: datetime | None, limit: int = 5
) -> list[dict]:
    """Verified items since the last visit, highest priority first (PLAN §1 feature 7)."""
    since = (last_seen or datetime.fromtimestamp(time.time() - 7 * 86400, UTC)).timestamp()
    members = await redis.zrevrangebyscore(f"feed:{user_id}", "+inf", since, start=0, num=50)
    pipe = redis.pipeline()
    for m in members:
        pipe.hgetall(f"story:{m}")
    cards = [c for c in await pipe.execute() if c]
    fresh = [c for c in cards if datetime.fromisoformat(c["publishedAt"]).timestamp() >= since]
    return [_public(c, read=False, score=0) for c in fresh[:limit]]


async def mark(redis: Redis, user_id: int, story_id: int, action: str) -> None:
    key = f"feed:{user_id}:{'read' if action == 'read' else 'dismissed'}"
    await redis.sadd(key, str(story_id))
    await redis.expire(key, TTL_S)


__all__ = ["Source", "backfill_user", "fanout", "mark", "read_feed", "select", "since_last_came"]
