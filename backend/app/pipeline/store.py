"""Evidence pipeline core (PLAN §6.2 filing → feed): store a raw item idempotently, then
process it: entity-link, detect Reg 30(11) denials, chunk, embed, index.

Everything is keyed by content hash, so re-delivery after a crash is harmless."""

import hashlib
import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.embed.client import EmbeddingUnavailable, embed
from app.models import Chunk, DocEntity, Document, Instrument
from app.verify import trail as tr
from app.verify.entities import link_entities
from app.verify.scrub import scrub

logger = logging.getLogger(__name__)

CHUNK_CHARS = 900
MAX_CHUNKS = 40

_CLARIFY = re.compile(
    r"\b(clarification|reg(ulation)?\s*30\s*\(\s*11\s*\)|news item|media report|rumou?r)\b", re.I
)
_DENY = re.compile(
    r"\b(not in any discussion|no such (proposal|information|discussion)|denies|baseless|"
    r"factually incorrect|speculative in nature|not aware of any)\b",
    re.I,
)


@dataclass
class RawItem:
    url: str
    title: str
    body: str
    published_at: datetime
    category: str | None = None
    symbol_hint: str | None = None
    attrs: dict = field(default_factory=dict)


def content_hash(item: RawItem) -> str:
    basis = f"{item.url}\n{item.title.strip()}\n{item.body.strip()}"
    return hashlib.sha256(basis.encode()).hexdigest()


def chunk_text(title: str, body: str, size: int = CHUNK_CHARS) -> list[str]:
    """Sentence-packed chunks of ~`size` chars; the title leads the first chunk."""
    text = f"{title.strip()}. {body.strip()}".strip(". ") if body.strip() else title.strip()
    sentences = [s.strip() for s in re.split(r"(?<=[.!?।])\s+", text) if s.strip()]
    chunks: list[str] = []
    cur = ""
    for s in sentences:
        if cur and len(cur) + len(s) + 1 > size:
            chunks.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
        while len(cur) > size * 1.5:  # one huge "sentence" (tables, run-on text)
            chunks.append(cur[:size])
            cur = cur[size:]
    if cur:
        chunks.append(cur)
    return chunks[:MAX_CHUNKS]


def is_denial(title: str, body: str) -> bool:
    t = f"{title} {body}"
    return bool(_CLARIFY.search(t) and _DENY.search(t))


async def store_item(session: AsyncSession, source_id: int, tier: int, item: RawItem) -> int | None:
    """Insert if new. Returns the document id, or None for a duplicate."""
    # Public records still name private individuals (SEBI orders list PANs); never keep them.
    title = scrub(item.title)[0]
    body = scrub(item.body)[0]
    stmt = (
        insert(Document)
        .values(
            source_id=source_id,
            url=item.url,
            title=title[:1000],
            body=body,
            content_hash=content_hash(item),
            simhash=tr.to_signed(tr.simhash(f"{title} {body}")),
            category=item.category,
            tier=tier,
            symbol_hint=item.symbol_hint,
            attrs=item.attrs,
            published_at=item.published_at,
        )
        .on_conflict_do_nothing(index_elements=[Document.content_hash])
        .returning(Document.id)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def process_document(session: AsyncSession, doc_id: int) -> list[int]:
    """Entity-link, chunk, embed and index one document. Returns linked instrument ids."""
    doc = await session.get(Document, doc_id)
    if doc is None or doc.processed_at is not None:
        return []

    instrument_ids: list[int] = []
    if doc.symbol_hint:
        iid = await session.scalar(
            select(Instrument.id).where(
                (Instrument.nse_symbol == doc.symbol_hint)
                | (Instrument.bse_code == doc.symbol_hint)
            )
        )
        if iid:
            instrument_ids.append(iid)
    entities, _ = await link_entities(session, f"{doc.title}. {doc.body[:3000]}", limit=4)
    for e in entities:
        if e.instrument_id and e.instrument_id not in instrument_ids:
            instrument_ids.append(e.instrument_id)

    for rank, iid in enumerate(instrument_ids):
        await session.execute(
            insert(DocEntity)
            .values(document_id=doc.id, instrument_id=iid, centrality=1.0 if rank == 0 else 0.5)
            .on_conflict_do_nothing()
        )

    pieces = chunk_text(doc.title, doc.body)
    vectors: list[list[float] | None] = [None] * len(pieces)
    try:
        vectors = list(await embed(pieces, "doc"))
    except EmbeddingUnavailable:
        pass  # lexical retrieval still works; a backfill job can embed later
    for i, (piece, vec) in enumerate(zip(pieces, vectors, strict=True)):
        session.add(
            Chunk(
                document_id=doc.id, ord=i, text=piece, published_at=doc.published_at,
                tier=doc.tier, instrument_ids=instrument_ids, embedding=vec,
            )
        )  # fmt: skip

    await session.execute(
        update(Document)
        .where(Document.id == doc.id)
        .values(processed_at=datetime.now(UTC), denies=is_denial(doc.title, doc.body))
    )
    await session.flush()
    return instrument_ids


async def backfill_embeddings(session: AsyncSession, batch: int = 16) -> int:
    rows = (
        await session.scalars(
            select(Chunk).where(Chunk.embedding.is_(None)).order_by(Chunk.id).limit(batch)
        )
    ).all()
    if not rows:
        return 0
    try:
        vecs = await embed([r.text for r in rows], "doc")
    except EmbeddingUnavailable:
        return 0
    for r, v in zip(rows, vecs, strict=True):
        r.embedding = v
    await session.commit()
    return len(rows)
