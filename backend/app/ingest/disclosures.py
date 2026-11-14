"""'Who's on the other side?' data (PLAN §9.3): bulk and block deals, insider trades.
Names are kept exactly as filed; the UI always says these are disclosures, not wrongdoing."""

import asyncio
import logging
from datetime import date, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingest import feeds
from app.ingest.http import get_with_retry
from app.models import Disclosure, Instrument
from app.pipeline.store import RawItem

logger = logging.getLogger(__name__)

NSE_EQ = "https://nsearchives.nseindia.com/content/equities/"
DEALS_PAGE = "https://www.nseindia.com/report-detail/display-bulk-and-block-deals"
INSIDER_PAGE = "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading"


async def _symbol_map(session: AsyncSession, symbols: set[str]) -> dict[str, int]:
    if not symbols:
        return {}
    rows = await session.execute(
        select(Instrument.nse_symbol, Instrument.id).where(Instrument.nse_symbol.in_(symbols))
    )
    return {s: i for s, i in rows}


async def upsert_deals(session: AsyncSession, rows: list[feeds.DealRow], kind: str) -> int:
    ids = await _symbol_map(session, {r.symbol for r in rows})
    n = 0
    for r in rows:
        verb = "Bought" if r.side == "BUY" else "Sold"
        res = await session.execute(
            insert(Disclosure)
            .values(
                instrument_id=ids.get(r.symbol),
                symbol=r.symbol,
                kind=kind,
                party=r.party,
                side=r.side,
                quantity=r.quantity,
                price=r.price,
                detail=f"{verb} {feeds.indian_number(r.quantity)} shares at ₹{r.price:,.2f}",
                deal_date=r.deal_date,
                source=f"NSE {kind.lower()}s",
                url=DEALS_PAGE,
                dedupe_key=f"nse:{kind}:{r.deal_date}:{r.symbol}:{r.party}:{r.side}:{r.quantity}:{r.price}",
            )  # fmt: skip
            .on_conflict_do_nothing(index_elements=[Disclosure.dedupe_key])
        )
        n += res.rowcount or 0
    await session.commit()
    return n


async def fetch_deals(session: AsyncSession, client: httpx.AsyncClient) -> dict[str, int]:
    out = {}
    for file, kind in (("bulk.csv", "Bulk deal"), ("block.csv", "Block deal")):
        resp = await get_with_retry(client, NSE_EQ + file)
        resp.raise_for_status()
        out[kind] = await upsert_deals(session, feeds.parse_deals_csv(resp.text), kind)
    return out


def insider_kind(side: str) -> str:
    s = side.lower()
    if "pledge" in s and ("revok" in s or "releas" in s):
        return "Pledge released"
    if "pledge" in s:
        return "Pledge created"
    return "Insider purchase" if s.startswith(("buy", "acqui")) else "Insider sale"


async def upsert_insider(session: AsyncSession, trades: list[feeds.InsiderTrade], url: str) -> int:
    ids = await _symbol_map(session, {t.symbol for t in trades if t.symbol})
    n = 0
    for t in trades:
        qty = f"{feeds.indian_number(t.quantity)} shares" if t.quantity else "shares"
        verb = {"Insider purchase": "Bought", "Insider sale": "Sold"}.get(
            insider_kind(t.side), t.side
        )
        how = f" ({t.mode})" if t.mode else ""
        party = f"{t.person} ({t.category})" if t.category else t.person
        res = await session.execute(
            insert(Disclosure)
            .values(
                instrument_id=ids.get(t.symbol),
                symbol=t.symbol or "?",
                kind=insider_kind(t.side),
                party=party,
                side=t.side.upper()[:8],
                quantity=t.quantity,
                detail=f"{verb} {qty}{how}",
                deal_date=t.trade_date or date.today(),
                source="NSE insider trading (PIT)",
                url=url,
                dedupe_key=f"nse:pit:{url}:{t.person}:{t.side}:{t.quantity}",
            )  # fmt: skip
            .on_conflict_do_nothing(index_elements=[Disclosure.dedupe_key])
        )
        n += res.rowcount or 0
    await session.commit()
    return n


async def ingest_insider_items(
    session: AsyncSession, client: httpx.AsyncClient, items: list[RawItem]
) -> int:
    """Each RSS item links to one XBRL file; fetch gently (2 at a time)."""
    sem = asyncio.Semaphore(2)

    async def one(item: RawItem) -> list[feeds.InsiderTrade]:
        async with sem:
            try:
                resp = await get_with_retry(client, item.url, attempts=2)
                resp.raise_for_status()
                return feeds.parse_insider_xbrl(resp.content)
            except Exception:  # noqa: BLE001
                logger.warning("insider xbrl failed: %s", item.url)
                return []

    total = 0
    results = await asyncio.gather(*(one(i) for i in items if i.url.endswith(".xml")))
    for item, trades in zip([i for i in items if i.url.endswith(".xml")], results, strict=True):
        if trades:
            total += await upsert_insider(session, trades, item.url)
    return total


__all__ = ["datetime", "fetch_deals", "ingest_insider_items", "upsert_deals", "upsert_insider"]
