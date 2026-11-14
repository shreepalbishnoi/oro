from datetime import date

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Instrument(TimestampMixin, Base):
    """Master list of listed equities and mutual fund schemes, keyed by ISIN where available."""

    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # equity | mf_scheme
    isin: Mapped[str | None] = mapped_column(String(12), unique=True)
    # MF schemes carry a second ISIN for the reinvestment option; CAS statements may use either.
    isin_alt: Mapped[str | None] = mapped_column(String(12), unique=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)

    # Equities
    nse_symbol: Mapped[str | None] = mapped_column(String(32), unique=True)
    bse_code: Mapped[str | None] = mapped_column(String(12), unique=True)
    series: Mapped[str | None] = mapped_column(String(8))
    is_sme: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    industry: Mapped[str | None] = mapped_column(String(120))
    # Business group (Tata, Adani, …) from a hand-curated map; drives group exposure.
    group_name: Mapped[str | None] = mapped_column(String(120))
    listed_on: Mapped[date | None] = mapped_column(Date)

    # Mutual fund schemes
    amfi_code: Mapped[str | None] = mapped_column(String(12), unique=True)
    amc: Mapped[str | None] = mapped_column(String(160))
    scheme_category: Mapped[str | None] = mapped_column(String(160))

    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (Index("ix_instruments_kind_active", "kind", "active"),)


class EntityAlias(Base):
    """Surface forms used for entity linking (names, tickers, nicknames, Hindi spellings)."""

    __tablename__ = "entity_aliases"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), index=True
    )
    alias: Mapped[str] = mapped_column(String(300), nullable=False)
    # Indexed in migration 0001 with text_pattern_ops (prefix LIKE) and trigram (fuzzy).
    alias_norm: Mapped[str] = mapped_column(String(300), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)  # nse | bse | amfi | manual

    __table_args__ = (
        UniqueConstraint("instrument_id", "alias_norm"),
        Index(
            "ix_entity_aliases_alias_norm",
            "alias_norm",
            postgresql_ops={"alias_norm": "text_pattern_ops"},
        ),
    )
