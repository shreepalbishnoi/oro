"""Room: linked portfolios and holdings. Quantities are encrypted at rest (AES-GCM)."""

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)  # cas | csv | manual
    label: Mapped[str] = mapped_column(Text, nullable=False)
    statement_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_portfolios_user_id", "user_id"),)


class Holding(Base):
    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(
        ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False
    )
    # Denormalised owner for row-level checks and the fan-out join.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="RESTRICT"), nullable=False
    )
    qty_enc: Mapped[str] = mapped_column(Text, nullable=False)
    cost_enc: Mapped[str | None] = mapped_column(Text)  # total cost in ₹, when the source has it
    as_of: Mapped[date | None] = mapped_column(Date)

    __table_args__ = (
        Index("ix_holdings_portfolio_id", "portfolio_id"),
        Index("ix_holdings_user_id", "user_id"),
        Index("ix_holdings_instrument_id", "instrument_id"),
    )


class PushSubscription(Base):
    """A browser's Web Push endpoint for one user (PLAN §9.6). Keys are the browser's public
    encryption keys, not secrets of ours; deleted when the push service reports it gone."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_push_subscriptions_user_id", "user_id"),)
