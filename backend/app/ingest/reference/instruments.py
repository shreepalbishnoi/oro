"""Instrument master loader: NSE + NSE SME + BSE (via bhavcopy) equities and AMFI schemes.

Run: python -m app.ingest.reference.instruments
Safe to re-run; it upserts on natural keys and only deactivates when the fresh lists look complete.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import configure_logging, log_extra
from app.db.session import dispose_engine, get_sessionmaker
from app.ingest.http import get_with_retry, make_client
from app.ingest.reference.classify import apply_labels, fetch_industries
from app.ingest.reference.normalize import normalize_name
from app.ingest.reference.parsers import (
    EquityRow,
    SchemeRow,
    merge_equities,
    parse_amfi_navall,
    parse_bse_bhavcopy,
    parse_nse_equity_list,
)
from app.models import EntityAlias, Instrument

logger = logging.getLogger(__name__)

NSE_EQUITY_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
NSE_SME_URL = "https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv"
BSE_BHAVCOPY_URL = (
    "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{ymd}_F_0000.CSV"
)
AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"

IST = ZoneInfo("Asia/Kolkata")
CHUNK = 1000
# Don't mark instruments inactive if a source returned suspiciously few rows (partial outage).
MIN_COMPLETENESS = 0.8


async def _fetch_text(client: httpx.AsyncClient, url: str, **kwargs: object) -> str:
    resp = await get_with_retry(client, url, **kwargs)
    resp.raise_for_status()
    return resp.text


async def fetch_bse_bhavcopy(client: httpx.AsyncClient, today: date) -> str:
    """Latest available BSE bhavcopy, walking back over weekends/holidays."""
    for back in range(0, 8):
        day = today - timedelta(days=back)
        url = BSE_BHAVCOPY_URL.format(ymd=day.strftime("%Y%m%d"))
        resp = await client.get(url, headers={"Referer": "https://www.bseindia.com/"})
        if resp.status_code == 200 and resp.text.startswith("TradDt"):
            logger.info("bse bhavcopy found", extra=log_extra(day=day.isoformat()))
            return resp.text
    raise RuntimeError("No BSE bhavcopy found in the last 8 days")


def _scheme_display_name(row: SchemeRow) -> str:
    parts = [row.name]
    if row.plan and row.plan.lower() not in row.name.lower():
        parts.append(row.plan.replace(" Plan", ""))
    if row.option and row.option.lower() not in row.name.lower():
        parts.append(row.option.replace(" Option", ""))
    return " · ".join(parts)[:300]


async def _release_conflicts(
    session: AsyncSession, column: str, key_to_isin: dict[str, str], kind: str
) -> None:
    """Free a unique code (symbol/BSE code) still held by a different ISIN, e.g. after a rename."""
    col = getattr(Instrument, column)
    rows = await session.execute(
        select(Instrument.id, col, Instrument.isin).where(
            Instrument.kind == kind, col.in_(list(key_to_isin))
        )
    )
    stale = [rid for rid, key, isin in rows if key_to_isin.get(key) != isin]
    if stale:
        await session.execute(
            update(Instrument).where(Instrument.id.in_(stale)).values({column: None})
        )


async def upsert_equities(session: AsyncSession, rows: list[EquityRow]) -> int:
    for column, attr in (("nse_symbol", "nse_symbol"), ("bse_code", "bse_code")):
        mapping = {getattr(r, attr): r.isin for r in rows if getattr(r, attr)}
        for i in range(0, len(mapping), CHUNK):
            chunk = dict(list(mapping.items())[i : i + CHUNK])
            await _release_conflicts(session, column, chunk, "equity")

    for i in range(0, len(rows), CHUNK):
        values = [
            {
                "kind": "equity",
                "isin": r.isin,
                "name": r.name[:300],
                "nse_symbol": r.nse_symbol,
                "bse_code": r.bse_code,
                "series": r.series,
                "is_sme": r.is_sme,
                "listed_on": r.listed_on,
                "active": True,
            }
            for r in rows[i : i + CHUNK]
        ]
        stmt = insert(Instrument).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=[Instrument.isin],
            set_={
                "name": stmt.excluded.name,
                "nse_symbol": stmt.excluded.nse_symbol,
                "bse_code": stmt.excluded.bse_code,
                "series": stmt.excluded.series,
                "is_sme": stmt.excluded.is_sme,
                "listed_on": stmt.excluded.listed_on,
                "active": True,
                "updated_at": datetime.now(IST),
            },
        )
        await session.execute(stmt)
    return len(rows)


async def upsert_schemes(session: AsyncSession, rows: list[SchemeRow]) -> int:
    # An ISIN can move between scheme codes after mergers; release it from the old code first.
    for column in ("isin", "isin_alt"):
        col = getattr(Instrument, column)
        isin_to_code = {getattr(r, column): r.amfi_code for r in rows if getattr(r, column)}
        keys = list(isin_to_code)
        for i in range(0, len(keys), CHUNK):
            found = await session.execute(
                select(Instrument.id, col, Instrument.amfi_code).where(col.in_(keys[i : i + CHUNK]))
            )
            stale = [rid for rid, isin, code in found if isin_to_code.get(isin) != code]
            if stale:
                await session.execute(
                    update(Instrument).where(Instrument.id.in_(stale)).values({column: None})
                )

    # Within one file an ISIN must map to a single row.
    seen: set[str] = set()
    clean: list[SchemeRow] = []
    for r in rows:
        for attr in ("isin", "isin_alt"):
            val = getattr(r, attr)
            if val and val in seen:
                setattr(r, attr, None)
            elif val:
                seen.add(val)
        clean.append(r)

    for i in range(0, len(clean), CHUNK):
        values = [
            {
                "kind": "mf_scheme",
                "amfi_code": r.amfi_code,
                "isin": r.isin,
                "isin_alt": r.isin_alt,
                "name": _scheme_display_name(r),
                "amc": r.amc[:160],
                "scheme_category": (r.category or "")[:160] or None,
                "active": True,
            }
            for r in clean[i : i + CHUNK]
        ]
        stmt = insert(Instrument).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=[Instrument.amfi_code],
            set_={
                "isin": stmt.excluded.isin,
                "isin_alt": stmt.excluded.isin_alt,
                "name": stmt.excluded.name,
                "amc": stmt.excluded.amc,
                "scheme_category": stmt.excluded.scheme_category,
                "active": True,
                "updated_at": datetime.now(IST),
            },
        )
        await session.execute(stmt)
    return len(clean)


async def deactivate_missing(
    session: AsyncSession, kind: str, key_column: str, fresh_keys: set[str]
) -> int:
    col = getattr(Instrument, key_column)
    active = set(
        (
            await session.scalars(
                select(col).where(
                    Instrument.kind == kind, Instrument.active.is_(True), col.isnot(None)
                )
            )
        ).all()
    )
    if active and len(fresh_keys) < MIN_COMPLETENESS * len(active):
        logger.warning(
            "skipping deactivation; fresh list looks partial",
            extra=log_extra(kind=kind, fresh=len(fresh_keys), active=len(active)),
        )
        return 0
    missing = list(active - fresh_keys)
    for i in range(0, len(missing), CHUNK):
        await session.execute(
            update(Instrument).where(col.in_(missing[i : i + CHUNK])).values(active=False)
        )
    return len(missing)


async def rebuild_aliases(session: AsyncSession, bse_symbols: dict[str, str]) -> int:
    """Name + ticker aliases for entity linking. Manual aliases (nicknames, Hindi) are untouched."""
    rows = (
        await session.execute(
            select(
                Instrument.id,
                Instrument.kind,
                Instrument.name,
                Instrument.nse_symbol,
                Instrument.isin,
            ).where(Instrument.active.is_(True))
        )
    ).all()
    values: list[dict[str, object]] = []
    for iid, kind, name, nse_symbol, isin in rows:
        candidates: list[tuple[str, str]] = [(name, "amfi" if kind == "mf_scheme" else "name")]
        if nse_symbol:
            candidates.append((nse_symbol, "nse"))
        if isin and isin in bse_symbols and bse_symbols[isin] != nse_symbol:
            candidates.append((bse_symbols[isin], "bse"))
        for alias, source in candidates:
            norm = normalize_name(alias)
            if norm:
                values.append(
                    {
                        "instrument_id": iid,
                        "alias": alias[:300],
                        "alias_norm": norm[:300],
                        "source": source,
                    }
                )
    for i in range(0, len(values), CHUNK):
        stmt = (
            insert(EntityAlias)
            .values(values[i : i + CHUNK])
            .on_conflict_do_nothing(
                index_elements=[EntityAlias.instrument_id, EntityAlias.alias_norm]
            )
        )
        await session.execute(stmt)
    return len(values)


async def load_all() -> dict[str, int]:
    today = datetime.now(IST).date()
    async with make_client() as client:
        nse_text, sme_text, bse_text, amfi_text = await asyncio.gather(
            _fetch_text(client, NSE_EQUITY_URL),
            _fetch_text(client, NSE_SME_URL),
            fetch_bse_bhavcopy(client, today),
            _fetch_text(client, AMFI_NAV_URL),
        )
        industries = await fetch_industries(client)

    nse = parse_nse_equity_list(nse_text)
    nse_sme = parse_nse_equity_list(sme_text, sme=True)
    bse = parse_bse_bhavcopy(bse_text)
    equities = merge_equities(nse, nse_sme, bse)
    schemes = parse_amfi_navall(amfi_text)
    bse_symbols = {r.isin: r.bse_symbol for r in bse if r.bse_symbol}

    stats: dict[str, int] = {
        "nse": len(nse),
        "nse_sme": len(nse_sme),
        "bse": len(bse),
        "equities": len(equities),
        "schemes": len(schemes),
    }
    async with get_sessionmaker()() as session, session.begin():
        stats["equities_upserted"] = await upsert_equities(session, equities)
        stats["schemes_upserted"] = await upsert_schemes(session, schemes)
        stats["equities_deactivated"] = await deactivate_missing(
            session, "equity", "isin", {r.isin for r in equities}
        )
        stats["schemes_deactivated"] = await deactivate_missing(
            session, "mf_scheme", "amfi_code", {r.amfi_code for r in schemes}
        )
        stats["aliases"] = await rebuild_aliases(session, bse_symbols)
        stats |= await apply_labels(session, industries)
    return stats


async def _main() -> None:
    configure_logging(get_settings().log_level)
    try:
        stats = await load_all()
        logger.info("instrument master loaded", extra=log_extra(**stats))
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(_main())
