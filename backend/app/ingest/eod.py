"""End-of-day data (PLAN §7): NSE bhavcopy (UDiFF), index closes and AMFI NAVs.
Feeds valuation ("as of last close"), the volume-spike scam signal and market mood."""

import csv
import io
import logging
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

import httpx
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingest.http import get_with_retry
from app.models import IndexEod, Instrument, PriceEod

logger = logging.getLogger(__name__)

BHAV_URL = (
    "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{d:%Y%m%d}_F_0000.csv.zip"
)
INDEX_URL = "https://nsearchives.nseindia.com/content/indices/ind_close_all_{d:%d%m%Y}.csv"
NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
EQUITY_SERIES = {"EQ", "BE", "BZ", "SM", "ST", "SZ"}


@dataclass
class BhavRow:
    isin: str
    symbol: str
    close: Decimal
    prev_close: Decimal | None
    volume: int | None
    trade_date: date


def _dec(v: str) -> Decimal | None:
    try:
        return Decimal(v) if v not in ("", "-") else None
    except InvalidOperation:
        return None


def parse_bhavcopy(text_: str) -> list[BhavRow]:
    out = []
    for r in csv.DictReader(io.StringIO(text_.lstrip("﻿"))):
        if r.get("FinInstrmTp") != "STK" or r.get("SctySrs") not in EQUITY_SERIES:
            continue
        close = _dec(r.get("ClsPric", ""))
        if close is None:
            continue
        try:
            vol = int(r["TtlTradgVol"]) if r.get("TtlTradgVol") else None
            d = date.fromisoformat(r["TradDt"])
        except (ValueError, KeyError):
            continue
        out.append(
            BhavRow(r["ISIN"], r["TckrSymb"], close, _dec(r.get("PrvsClsgPric", "")), vol, d)
        )
    return out


def parse_index_close(text_: str) -> list[tuple[str, date, Decimal, Decimal | None]]:
    out = []
    for r in csv.DictReader(io.StringIO(text_.lstrip("﻿"))):
        try:
            d = datetime.strptime(r["Index Date"].strip(), "%d-%m-%Y").date()
            close = Decimal(r["Closing Index Value"].strip())
        except (KeyError, ValueError, InvalidOperation):
            continue
        out.append(
            (r["Index Name"].strip().upper(), d, close, _dec(r.get("Change(%)", "").strip()))
        )
    return out


def parse_nav(text_: str) -> list[tuple[str, Decimal, date]]:
    """AMFI NAVAll.txt -> (amfi_code, nav, date)."""
    out = []
    for line in text_.splitlines():
        parts = [p.strip() for p in line.split(";")]
        if len(parts) < 6 or not parts[0].isdigit():
            continue
        nav = _dec(parts[-2])
        try:
            d = datetime.strptime(parts[-1], "%d-%b-%Y").date()
        except ValueError:
            continue
        if nav is not None and nav > 0:
            out.append((parts[0], nav, d))
    return out


async def _upsert_prices(
    session: AsyncSession, rows: list[tuple[int, date, Decimal, Decimal | None, int | None]]
) -> int:
    for i in range(0, len(rows), 1000):
        batch = rows[i : i + 1000]
        stmt = insert(PriceEod).values(
            [
                {"instrument_id": a, "trade_date": b, "close": c, "prev_close": d, "volume": e}
                for a, b, c, d, e in batch
            ]
        )
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=[PriceEod.instrument_id, PriceEod.trade_date],
                set_={
                    "close": stmt.excluded.close,
                    "prev_close": stmt.excluded.prev_close,
                    "volume": stmt.excluded.volume,
                },
            )
        )
    await session.commit()
    return len(rows)


async def load_bhavcopy(session: AsyncSession, rows: list[BhavRow]) -> int:
    ids = dict(
        (
            await session.execute(
                select(Instrument.isin, Instrument.id).where(Instrument.kind == "equity")
            )
        ).all()
    )
    sym = dict(
        (
            await session.execute(
                select(Instrument.nse_symbol, Instrument.id).where(
                    Instrument.nse_symbol.is_not(None)
                )
            )
        ).all()
    )
    data = []
    for r in rows:
        iid = ids.get(r.isin) or sym.get(r.symbol)
        if iid:
            data.append((iid, r.trade_date, r.close, r.prev_close, r.volume))
    return await _upsert_prices(session, data)


async def load_index_closes(
    session: AsyncSession, rows: list[tuple[str, date, Decimal, Decimal | None]]
) -> int:
    for name, d, close, chg in rows:
        stmt = insert(IndexEod).values(index_name=name, trade_date=d, close=close, change_pct=chg)
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=[IndexEod.index_name, IndexEod.trade_date],
                set_={"close": close, "change_pct": chg},
            )
        )
    await session.commit()
    return len(rows)


async def load_navs(session: AsyncSession, rows: list[tuple[str, Decimal, date]]) -> int:
    ids = dict(
        (
            await session.execute(
                select(Instrument.amfi_code, Instrument.id).where(Instrument.amfi_code.is_not(None))
            )
        ).all()
    )
    data = [(ids[c], d, nav, None, None) for c, nav, d in rows if c in ids]
    return await _upsert_prices(session, data)


async def fetch_eod(
    session: AsyncSession, client: httpx.AsyncClient, day: date | None = None
) -> dict[str, int]:
    """Tries today, then walks back over weekends and holidays (up to 5 days)."""
    stats: dict[str, int] = {}
    start = day or date.today()
    for back in range(5):
        d = start - timedelta(days=back)
        resp = await get_with_retry(client, BHAV_URL.format(d=d), attempts=2)
        if resp.status_code == 200 and resp.content[:2] == b"PK":
            with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                csv_text = z.read(z.namelist()[0]).decode("utf-8", errors="replace")
            stats["prices"] = await load_bhavcopy(session, parse_bhavcopy(csv_text))
            idx = await get_with_retry(client, INDEX_URL.format(d=d), attempts=2)
            if idx.status_code == 200:
                stats["indices"] = await load_index_closes(session, parse_index_close(idx.text))
            stats["date"] = int(d.strftime("%Y%m%d"))
            break
    nav = await get_with_retry(client, NAV_URL)
    if nav.status_code == 200:
        stats["navs"] = await load_navs(session, parse_nav(nav.text))
    await session.execute(text("ANALYZE prices_eod"))
    return stats
