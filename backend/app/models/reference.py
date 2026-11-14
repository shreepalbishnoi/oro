"""Reference data beyond the instrument master: SEBI register, surveillance, end-of-day prices,
index closes and fund look-through weights."""

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Index, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RegisteredIntermediary(Base):
    __tablename__ = "registered_intermediaries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # RA | IA
    reg_no: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    name_norm: Mapped[str] = mapped_column(Text, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date)
    as_of: Mapped[date] = mapped_column(Date, nullable=False)


class SurveillanceFlag(Base):
    __tablename__ = "surveillance_flags"

    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), primary_key=True
    )
    list: Mapped[str] = mapped_column(Text, primary_key=True)  # ASM | GSM | ESM
    stage: Mapped[str] = mapped_column(Text, nullable=False)
    as_of: Mapped[date] = mapped_column(Date, nullable=False)


class PriceEod(Base):
    """Last-close values only (PLAN §7 display rules): equities from bhavcopy, funds from NAV."""

    __tablename__ = "prices_eod"

    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), primary_key=True
    )
    trade_date: Mapped[date] = mapped_column(Date, primary_key=True)
    close: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    prev_close: Mapped[Decimal | None] = mapped_column(Numeric(16, 4))
    volume: Mapped[int | None] = mapped_column(BigInteger)

    __table_args__ = (Index("ix_prices_eod_trade_date", "trade_date"),)


class IndexEod(Base):
    __tablename__ = "index_eod"

    index_name: Mapped[str] = mapped_column(Text, primary_key=True)
    trade_date: Mapped[date] = mapped_column(Date, primary_key=True)
    close: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    change_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))


class FundPortfolio(Base):
    """Monthly AMC disclosure: what share of a scheme sits in each company."""

    __tablename__ = "fund_portfolios"

    scheme_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), primary_key=True
    )
    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), primary_key=True
    )
    as_of: Mapped[date] = mapped_column(Date, primary_key=True)
    weight: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)  # 0..1

    __table_args__ = (Index("ix_fund_portfolios_instrument_id", "instrument_id"),)
