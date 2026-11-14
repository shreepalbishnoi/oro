"""Holdings persistence: resolve imported rows to instruments, store quantities encrypted
(AES-GCM, bound to the owner), load positions back."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from redis.asyncio import Redis
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_field, encrypt_field
from app.ingest.reference.normalize import normalize_name
from app.models import EntityAlias, Holding, Instrument, Portfolio
from app.room.importers import ParsedHolding, ParsedStatement


@dataclass
class Position:
    holding_id: int
    portfolio_id: int
    portfolio_label: str
    source: str
    instrument: Instrument
    qty: Decimal
    cost: Decimal | None


def _aad(user_id: int) -> str:
    return f"user:{user_id}"


async def resolve(
    session: AsyncSession, rows: list[ParsedHolding]
) -> tuple[list[tuple[ParsedHolding, Instrument]], list[str]]:
    isins = {r.isin for r in rows if r.isin}
    amfis = {r.amfi for r in rows if r.amfi}
    symbols = {r.symbol for r in rows if r.symbol}
    found = (
        await session.scalars(
            select(Instrument).where(
                or_(
                    Instrument.isin.in_(isins or {""}),
                    Instrument.isin_alt.in_(isins or {""}),
                    Instrument.amfi_code.in_(amfis or {""}),
                    Instrument.nse_symbol.in_(symbols or {""}),
                    Instrument.bse_code.in_(symbols or {""}),
                )
            )
        )
    ).all()
    by_isin = {i.isin: i for i in found if i.isin} | {i.isin_alt: i for i in found if i.isin_alt}
    by_amfi = {i.amfi_code: i for i in found if i.amfi_code}
    by_sym = {i.nse_symbol: i for i in found if i.nse_symbol} | {
        i.bse_code: i for i in found if i.bse_code
    }

    matched: list[tuple[ParsedHolding, Instrument]] = []
    unmatched: list[str] = []
    for r in rows:
        inst = (
            (by_isin.get(r.isin) if r.isin else None)
            or (by_amfi.get(r.amfi) if r.amfi else None)
            or (by_sym.get(r.symbol) if r.symbol else None)
        )
        if inst is None and r.name:
            norm = normalize_name(r.name)
            inst = await session.scalar(
                select(Instrument)
                .join(EntityAlias, EntityAlias.instrument_id == Instrument.id)
                .where(EntityAlias.alias_norm == norm, Instrument.kind == r.kind)
                .limit(1)
            )
        if inst is None:
            unmatched.append(r.name or r.isin or "?")
        else:
            matched.append((r, inst))
    return matched, unmatched


async def save_statement(
    session: AsyncSession, redis: Redis, user_id: int, stmt: ParsedStatement
) -> tuple[Portfolio, int, list[str]]:
    """A new statement from the same source/label replaces the previous one."""
    matched, unmatched = await resolve(session, stmt.holdings)
    await session.execute(
        delete(Portfolio).where(
            Portfolio.user_id == user_id,
            Portfolio.source == stmt.source,
            Portfolio.label == stmt.label,
        )
    )
    p = Portfolio(
        user_id=user_id, source=stmt.source, label=stmt.label, statement_date=stmt.statement_date
    )
    session.add(p)
    await session.flush()
    merged: dict[int, tuple[Decimal, Decimal | None]] = {}
    for row, inst in matched:
        qty, cost = merged.get(inst.id, (Decimal(0), None))
        cost = (cost or Decimal(0)) + row.cost if row.cost is not None else cost
        merged[inst.id] = (qty + row.qty, cost)
    for iid, (qty, cost) in merged.items():
        session.add(
            Holding(
                portfolio_id=p.id,
                user_id=user_id,
                instrument_id=iid,
                qty_enc=encrypt_field(str(qty), _aad(user_id)),
                cost_enc=encrypt_field(str(cost), _aad(user_id)) if cost is not None else None,
                as_of=stmt.statement_date or date.today(),
            )  # fmt: skip
        )
    await session.commit()
    await invalidate(redis, user_id)
    return p, len(merged), unmatched


async def add_manual(
    session: AsyncSession, redis: Redis, user_id: int, instrument_id: int, qty: Decimal
) -> int:
    p = await session.scalar(
        select(Portfolio).where(Portfolio.user_id == user_id, Portfolio.source == "manual")
    )
    if p is None:
        p = Portfolio(user_id=user_id, source="manual", label="Added by hand")
        session.add(p)
        await session.flush()
    h = Holding(
        portfolio_id=p.id, user_id=user_id, instrument_id=instrument_id,
        qty_enc=encrypt_field(str(qty), _aad(user_id)), as_of=date.today(),
    )  # fmt: skip
    session.add(h)
    await session.commit()
    await invalidate(redis, user_id)
    return h.id


async def load_positions(session: AsyncSession, user_id: int) -> list[Position]:
    rows = (
        await session.execute(
            select(Holding, Portfolio, Instrument)
            .join(Portfolio, Portfolio.id == Holding.portfolio_id)
            .join(Instrument, Instrument.id == Holding.instrument_id)
            .where(Holding.user_id == user_id)
        )
    ).all()
    out = []
    for h, p, inst in rows:
        out.append(
            Position(
                holding_id=h.id,
                portfolio_id=p.id,
                portfolio_label=p.label,
                source=p.source,
                instrument=inst,
                qty=Decimal(decrypt_field(h.qty_enc, _aad(user_id))),
                cost=Decimal(decrypt_field(h.cost_enc, _aad(user_id))) if h.cost_enc else None,
            )  # fmt: skip
        )
    return out


async def invalidate(redis: Redis, user_id: int) -> None:
    await redis.delete(f"room:xray:{user_id}", f"room:held:{user_id}")
