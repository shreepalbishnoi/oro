"""Discover panel (PLAN §9.5). Rules only: every user sees the same cards for the same story,
in a fixed public order. No rankings by returns, no "top picks", no suggestion to act.
Only 'Your concentration' is personal, and it is plain arithmetic."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

DISCLAIMER = "For information, not a recommendation."


async def connected_companies(
    session: AsyncSession, instrument_id: int, limit: int = 6
) -> list[dict]:
    """Same business group first, then same industry; alphabetical within each (no ranking by
    size or performance, so the order can't read as a preference)."""
    rows = await session.execute(
        text(
            """
            WITH me AS (SELECT group_name, industry FROM instruments WHERE id = :id)
            SELECT i.id, coalesce(i.nse_symbol, i.bse_code) AS symbol, i.name,
                   CASE WHEN i.group_name IS NOT NULL AND i.group_name = me.group_name THEN 'Same group'
                        ELSE 'Same industry' END AS why
            FROM instruments i, me
            WHERE i.id <> :id AND i.active AND i.kind = 'equity'
              AND ((me.group_name IS NOT NULL AND i.group_name = me.group_name)
                   OR (me.industry IS NOT NULL AND i.industry = me.industry))
            ORDER BY (i.group_name IS NOT DISTINCT FROM me.group_name) DESC, i.name
            LIMIT :lim
            """
        ),
        {"id": instrument_id, "lim": limit},
    )
    return [dict(r._mapping) for r in rows]


async def funds_holding(session: AsyncSession, instrument_id: int, limit: int = 6) -> list[dict]:
    rows = await session.execute(
        text(
            """
            SELECT s.id, s.name, fp.weight, fp.as_of
            FROM fund_portfolios fp JOIN instruments s ON s.id = fp.scheme_id
            WHERE fp.instrument_id = :id
              AND fp.as_of = (SELECT max(as_of) FROM fund_portfolios f2 WHERE f2.scheme_id = fp.scheme_id)
            ORDER BY fp.weight DESC LIMIT :lim
            """
        ),
        {"id": instrument_id, "lim": limit},
    )
    return [
        {"id": r.id, "name": r.name, "weight": float(r.weight), "asOf": r.as_of.isoformat()}
        for r in rows
    ]


async def missed_filings(
    session: AsyncSession, instrument_ids: list[int], exclude_doc: int | None, days: int = 14
) -> list[dict]:
    if not instrument_ids:
        return []
    rows = await session.execute(
        text(
            """
            SELECT DISTINCT ON (d.id) d.id, d.title, d.url, d.published_at
            FROM doc_entities de JOIN documents d ON d.id = de.document_id
            WHERE de.instrument_id = ANY(:ids) AND d.tier = 1 AND d.published_at >= :since
              AND d.id <> coalesce(:ex, 0)
            ORDER BY d.id DESC LIMIT 6
            """
        ),
        {
            "ids": instrument_ids,
            "since": datetime.now(UTC) - timedelta(days=days),
            "ex": exclude_doc,
        },
    )
    return [
        {"id": r.id, "title": r.title, "url": r.url, "publishedAt": r.published_at.isoformat()}
        for r in rows
    ]


async def discover_for_story(
    session: AsyncSession, story_id: int, concentration: dict | None
) -> dict:
    ids = [
        r[0]
        for r in await session.execute(
            text(
                "SELECT instrument_id FROM doc_entities WHERE document_id = :d ORDER BY centrality DESC"
            ),
            {"d": story_id},
        )
    ]
    cards: list[dict] = []
    if ids:
        main = ids[0]
        if conn := await connected_companies(session, main):
            cards.append({"kind": "connected", "title": "Connected companies", "items": conn})
        if funds := await funds_holding(session, main):
            cards.append({"kind": "funds", "title": "Funds that hold this", "items": funds})
        related = [c["id"] for c in conn] if conn else []
        if missed := await missed_filings(session, [main, *related], story_id):
            cards.append(
                {"kind": "filings", "title": "Filings you might have missed", "items": missed}
            )
    if concentration:
        cards.append(
            {"kind": "concentration", "title": "Your concentration", "items": [concentration]}
        )
    return {
        "storyId": story_id,
        "cards": cards,
        "disclaimer": DISCLAIMER,
        "asOf": date.today().isoformat(),
    }
