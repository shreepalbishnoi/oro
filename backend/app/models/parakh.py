"""Parakh checks, Forward Trail fingerprints, error reports and public corrections."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Check(Base):
    __tablename__ = "checks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Unguessable public id used in URLs; the bigint never leaves the server.
    public_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    anon_key: Mapped[str | None] = mapped_column(Text)  # HMAC of IP for anonymous history
    channel: Mapped[str] = mapped_column(Text, nullable=False, default="web")  # web|share|telegram
    input_kind: Mapped[str] = mapped_column(Text, nullable=False)
    redacted_text: Mapped[str] = mapped_column(Text, nullable=False)
    exact_hash: Mapped[str] = mapped_column(Text, nullable=False)
    simhash: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    verdict: Mapped[dict | None] = mapped_column(JSONB)
    karat: Mapped[int | None] = mapped_column(SmallInteger)
    risk: Mapped[str | None] = mapped_column(Text)
    mode: Mapped[str | None] = mapped_column(Text)
    signal_ids: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    share_slug: Mapped[str | None] = mapped_column(Text, unique=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_checks_user_created", "user_id", "created_at"),
        Index("ix_checks_exact_hash_created", "exact_hash", "created_at"),
        Index("ix_checks_created_at", "created_at"),
        Index("ix_checks_anon_key", "anon_key"),
    )


class ForwardFingerprint(Base):
    """One row per distinct (normalised) message text, grouped into clusters of variants.
    Holds hashes and counts only: it can't be read back as text."""

    __tablename__ = "forward_fingerprints"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cluster_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    exact_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    simhash: Mapped[int] = mapped_column(BigInteger, nullable=False)
    check_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    channels: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_forward_fingerprints_cluster_id", "cluster_id"),
        Index("ix_forward_fingerprints_last_seen", "last_seen"),
    )


class ErrorReport(Base):
    __tablename__ = "error_reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    check_id: Mapped[int] = mapped_column(
        ForeignKey("checks.id", ondelete="CASCADE"), nullable=False
    )
    what: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_error_reports_check_id", "check_id"),)


class Correction(Base):
    """Public log of verdicts ORO got wrong (PLAN §9.8)."""

    __tablename__ = "corrections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    check_id: Mapped[int | None] = mapped_column(ForeignKey("checks.id", ondelete="SET NULL"))
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    before_label: Mapped[str | None] = mapped_column(Text)
    after_label: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_corrections_check_id", "check_id"),)
