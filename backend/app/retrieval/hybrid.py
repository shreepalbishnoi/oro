"""Hybrid retrieval (PLAN §9.1): vector (pgvector HNSW) + lexical (Postgres FTS), fused with
reciprocal rank fusion, then boosted by entity match, source tier and recency.

Lexical uses an OR-query over the claim's significant tokens so long claims still match;
ts_rank_cd orders by density. Vector search is skipped transparently when embeddings are off."""

import logging
import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.embed.client import EmbeddingUnavailable, embed
from app.verify.text import normalize

logger = logging.getLogger(__name__)

RRF_K = 60
LEG_LIMIT = 50
TIER_BOOST = {1: 1.25, 2: 1.2, 3: 1.0, 4: 0.8}
# Recency half-life in days by claim type (PLAN §9.1).
HALF_LIFE = {"price": 3, "rumour": 3, "results": 90, "governance": 365, "default": 30}

_STOP = {
    "the", "and", "for", "with", "from", "that", "this", "has", "have", "was", "will", "are",
    "its", "into", "about", "company", "limited", "ltd", "share", "shares", "stock", "hai",
    "mein", "aur", "kya", "nahi", "par", "rs", "inr", "crore", "lakh",
}  # fmt: skip


@dataclass
class Hit:
    chunk_id: int
    document_id: int
    text: str
    title: str
    url: str
    source: str
    tier: int
    published_at: datetime
    denies: bool
    score: float


def or_tsquery(claim: str, max_terms: int = 16) -> str | None:
    toks: list[str] = []
    for t in normalize(claim).replace(".", " ").split():
        if len(t) >= 3 and t not in _STOP and t not in toks and re.fullmatch(r"[\w]+", t):
            toks.append(t)
    return " | ".join(toks[:max_terms]) or None


def recency_factor(published_at: datetime, half_life_days: float, now: datetime) -> float:
    age = max(0.0, (now - published_at).total_seconds() / 86400)
    return max(0.3, math.exp(-math.log(2) * age / half_life_days))


_SELECT = """
SELECT c.id, c.document_id, c.text, c.tier, c.published_at, d.title, d.url, d.denies,
       s.name AS source
FROM chunks c
JOIN documents d ON d.id = c.document_id
JOIN sources s ON s.id = d.source_id
WHERE c.id = ANY(:ids)
"""


# Static SQL per variant (no string building); every value is a bound parameter.
_VEC_ALL = text(
    "SELECT c.id FROM chunks c WHERE c.embedding IS NOT NULL "
    "ORDER BY c.embedding <=> CAST(:vec AS vector) LIMIT :lim"
)
_VEC_ONE = text(
    "SELECT c.id FROM chunks c "
    "WHERE c.instrument_ids @> ARRAY[CAST(:iid AS bigint)] AND c.embedding IS NOT NULL "
    "ORDER BY c.embedding <=> CAST(:vec AS vector) LIMIT :lim"
)
_LEX_ALL = text(
    "SELECT c.id FROM chunks c, to_tsquery('simple', :q) q WHERE c.tsv @@ q "
    "ORDER BY ts_rank_cd(c.tsv, q) DESC LIMIT :lim"
)
_LEX_ONE = text(
    "SELECT c.id FROM chunks c, to_tsquery('simple', :q) q "
    "WHERE c.tsv @@ q AND c.instrument_ids @> ARRAY[CAST(:iid AS bigint)] "
    "ORDER BY ts_rank_cd(c.tsv, q) DESC LIMIT :lim"
)


async def _vector_leg(
    session: AsyncSession, vec: list[float], instrument_id: int | None
) -> list[int]:
    params: dict = {"vec": str(vec), "lim": LEG_LIMIT}
    if instrument_id:
        params["iid"] = instrument_id
    # HNSW recall knob; local to this transaction.
    await session.execute(text("SET LOCAL hnsw.ef_search = 80"))
    stmt = _VEC_ONE if instrument_id else _VEC_ALL
    return [r[0] for r in (await session.execute(stmt, params)).all()]


async def _lexical_leg(session: AsyncSession, query: str, instrument_id: int | None) -> list[int]:
    params: dict = {"q": query, "lim": LEG_LIMIT}
    if instrument_id:
        params["iid"] = instrument_id
    stmt = _LEX_ONE if instrument_id else _LEX_ALL
    return [r[0] for r in (await session.execute(stmt, params)).all()]


async def search(
    session: AsyncSession,
    claim: str,
    *,
    instrument_id: int | None = None,
    claim_type: str = "default",
    k: int = 8,
    query_vec: list[float] | None = None,
) -> list[Hit]:
    now = datetime.now(UTC)
    tsq = or_tsquery(claim)
    if query_vec is None:
        try:
            query_vec = (await embed([claim], "query"))[0]
        except EmbeddingUnavailable:
            query_vec = None

    async def legs(iid: int | None) -> list[list[int]]:
        out = []
        if query_vec is not None:
            out.append(await _vector_leg(session, query_vec, iid))
        if tsq:
            out.append(await _lexical_leg(session, tsq, iid))
        return out

    ranked = await legs(instrument_id)
    if instrument_id and sum(len(r) for r in ranked) < 3:
        ranked += await legs(None)  # entity tagging can miss; widen rather than return nothing

    fused: dict[int, float] = {}
    for leg in ranked:
        for rank, cid in enumerate(leg, start=1):
            fused[cid] = fused.get(cid, 0.0) + 1.0 / (RRF_K + rank)
    if not fused:
        return []

    candidates = sorted(fused, key=fused.get, reverse=True)[: k * 4]  # type: ignore[arg-type]
    rows = (await session.execute(text(_SELECT), {"ids": candidates})).mappings().all()
    half = HALF_LIFE.get(claim_type, HALF_LIFE["default"])
    hits = [
        Hit(
            chunk_id=r["id"],
            document_id=r["document_id"],
            text=r["text"],
            title=r["title"],
            url=r["url"],
            source=r["source"],
            tier=r["tier"],
            published_at=r["published_at"],
            denies=r["denies"],
            score=fused[r["id"]]
            * TIER_BOOST.get(r["tier"], 1.0)
            * recency_factor(r["published_at"], half, now)
            # A company's own denial to the exchange outranks press coverage.
            * (1.3 if r["denies"] else 1.0),
        )
        for r in rows
    ]
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:k]


def claim_type_of(claim_text: str) -> str:
    t = claim_text.lower()
    if re.search(r"\b(results?|profit|revenue|quarter|q[1-4])\b", t):
        return "results"
    if re.search(r"\b(rumou?r|talks|sources|likely)\b", t):
        return "rumour"
    if re.search(r"\b(auditor|resign|ceo|cfo|director|pledge|sebi order)\b", t):
        return "governance"
    return "default"
