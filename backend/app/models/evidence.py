"""Evidence store: sources, documents, chunks, entity links and public disclosures (PLAN §8)."""

from datetime import date, datetime
from decimal import Decimal

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

EMBED_DIM = 768


class Source(Base):
    """One polled feed. Holds its own conditional-GET state, high-water mark and breaker."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 1 filing … 4 other
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # rss | csv
    url: Mapped[str] = mapped_column(Text, nullable=False)
    poll_market_s: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    poll_off_s: Mapped[int] = mapped_column(Integer, nullable=False, default=1800)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    etag: Mapped[str | None] = mapped_column(Text)
    last_modified: Mapped[str | None] = mapped_column(Text)
    high_water: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_poll_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_ok_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    fail_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items_total: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("sources.id", ondelete="RESTRICT"), nullable=False
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    simhash: Mapped[int | None] = mapped_column(BigInteger)
    category: Mapped[str | None] = mapped_column(Text)
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    symbol_hint: Mapped[str | None] = mapped_column(Text)
    # Reg 30(11) clarification that denies a market rumour.
    denies: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    attrs: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lang: Mapped[str] = mapped_column(Text, nullable=False, default="en")

    __table_args__ = (
        Index("ix_documents_published_at", "published_at"),
        Index("ix_documents_source_id", "source_id"),
        Index("ix_documents_unprocessed", "id", postgresql_where="processed_at IS NULL"),
    )


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    ord: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # Denormalised for filter-before-rank retrieval without a join.
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    instrument_ids: Mapped[list[int]] = mapped_column(
        ARRAY(BigInteger), nullable=False, default=list
    )
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBED_DIM))
    # 'simple' config: no English stemming, so Hinglish and tickers survive tokenisation.
    tsv: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple', text)", persisted=True)
    )

    __table_args__ = (
        Index("ix_chunks_document_id", "document_id"),
        Index("ix_chunks_published_at", "published_at"),
        Index("ix_chunks_tsv", "tsv", postgresql_using="gin"),
        Index("ix_chunks_instrument_ids", "instrument_ids", postgresql_using="gin"),
        Index(
            "ix_chunks_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )


class DocEntity(Base):
    __tablename__ = "doc_entities"

    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), primary_key=True
    )
    centrality: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    __table_args__ = (Index("ix_doc_entities_instrument_id", "instrument_id"),)


class Disclosure(Base):
    """Bulk/block deals, insider trades, pledges: the 'Who's on the other side?' panel."""

    __tablename__ = "disclosures"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    instrument_id: Mapped[int | None] = mapped_column(
        ForeignKey("instruments.id", ondelete="SET NULL")
    )
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # Bulk deal | Block deal | Insider …
    party: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str | None] = mapped_column(Text)  # BUY | SELL
    quantity: Mapped[int | None] = mapped_column(BigInteger)
    price: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    deal_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    dedupe_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)

    __table_args__ = (
        Index("ix_disclosures_instrument_date", "instrument_id", "deal_date"),
        Index("ix_disclosures_symbol_date", "symbol", "deal_date"),
    )
