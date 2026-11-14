import re
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import case, func, or_, select

from app.api.deps import SessionDep
from app.ingest.reference.normalize import normalize_name
from app.models import EntityAlias, Instrument

router = APIRouter(prefix="/v1/instruments", tags=["instruments"])


class InstrumentOut(BaseModel):
    id: int
    kind: str
    name: str
    isin: str | None
    nse_symbol: str | None
    bse_code: str | None
    is_sme: bool
    amc: str | None


@router.get("/search", response_model=list[InstrumentOut])
async def search_instruments(
    session: SessionDep,
    q: Annotated[str, Query(min_length=1, max_length=80)],
    kind: Annotated[str | None, Query(pattern="^(equity|mf_scheme)$")] = None,
    limit: Annotated[int, Query(ge=1, le=25)] = 10,
) -> list[InstrumentOut]:
    # Tickers only use A-Z, 0-9, '&' and '-' (M&M, BAJAJ-AUTO); dropping the rest also
    # strips LIKE wildcards (% and _) from user input.
    q_upper = re.sub(r"[^A-Z0-9&-]", "", q.strip().upper())
    q_norm = normalize_name(q)
    # An empty pattern would turn `LIKE '%'` into a full scan, so each matcher is opt-in.
    matchers = []
    if q_upper:
        matchers += [
            Instrument.nse_symbol.like(f"{q_upper}%"),
            Instrument.bse_code == q_upper,
            Instrument.isin == q_upper,
        ]
    if q_norm:
        alias_hit = select(EntityAlias.instrument_id).where(
            EntityAlias.alias_norm.like(f"{q_norm}%")
        )
        matchers.append(Instrument.id.in_(alias_hit))
    if not matchers:
        return []
    # Exact ticker/ISIN first, then ticker prefix, then alias/name matches.
    rank = case(
        (or_(Instrument.nse_symbol == q_upper, Instrument.isin == q_upper), 0),
        (Instrument.nse_symbol.like(f"{q_upper}%"), 1),
        else_=2,
    )
    stmt = (
        select(Instrument)
        .where(Instrument.active.is_(True), or_(*matchers))
        .order_by(rank, func.length(Instrument.name))
        .limit(limit)
    )
    if kind:
        stmt = stmt.where(Instrument.kind == kind)
    rows = (await session.scalars(stmt)).all()
    return [InstrumentOut.model_validate(r, from_attributes=True) for r in rows]
