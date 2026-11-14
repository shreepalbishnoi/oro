"""Source parsers on real samples (fetched 2026-11-11; PANs and the insider's name anonymised)."""

from datetime import date
from decimal import Decimal
from pathlib import Path

from app.ingest import feeds
from app.ingest.disclosures import insider_kind
from app.ingest.eod import parse_bhavcopy, parse_index_close, parse_nav
from app.ingest.pdf import worth_reading
from app.ingest.sebi_registry import parse_register_page
from app.market.mood import direction
from app.pipeline.store import chunk_text, is_denial
from app.room.feed import is_routine
from app.room.importers import ImportFailed, parse_broker_csv

FX = Path(__file__).parent / "fixtures"


def test_nse_announcements() -> None:
    items = feeds.parse_nse_announcements((FX / "nse_announcements.xml").read_bytes())
    assert len(items) == 8
    first = items[0]
    assert first.symbol_hint == "AHL"
    assert first.category == "Outcome of Board Meeting"
    assert "|SUBJECT" not in first.body
    assert first.published_at.isoformat() == "2026-11-11T21:53:38+05:30"


def test_sebi_rss_skips_recovery_proceedings_and_parses_dates() -> None:
    raw = (FX / "sebi_rss.xml").read_bytes()
    items = feeds.parse_rss(raw)
    assert raw.count(b"<item>") == 5
    assert all("recovery" not in i.url and "Recovery Certificate" not in i.title for i in items)
    assert all(i.published_at.tzinfo for i in items)
    assert feeds.parse_date("11 Nov, 2026 +0530").isoformat() == "2026-11-11T00:00:00+05:30"


def test_bulk_deals_csv() -> None:
    rows = feeds.parse_deals_csv((FX / "nse_bulk.csv").read_text(encoding="utf-8"))
    assert len(rows) == 7
    r = rows[0]
    assert (r.symbol, r.side, r.quantity, r.deal_date) == (
        "AAATECH",
        "BUY",
        66829,
        date(2026, 11, 11),
    )


def test_insider_xbrl() -> None:
    trades = feeds.parse_insider_xbrl((FX / "nse_insider_xbrl.xml").read_bytes())
    assert len(trades) == 1
    t = trades[0]
    assert (t.symbol, t.person, t.side, t.quantity) == ("RELTD", "Ananya Rao", "Buy", 70000)
    assert t.category == "Director" and t.trade_date == date(2026, 4, 29)
    assert insider_kind("Buy") == "Insider purchase"
    assert insider_kind("Pledge Revoke") == "Pledge released"


def test_bhavcopy_and_indices() -> None:
    rows = parse_bhavcopy((FX / "nse_bhavcopy_udiff.csv").read_text(encoding="utf-8"))
    assert len(rows) == 8
    assert (
        rows[0].symbol == "20MICRONS"
        and rows[0].close == Decimal("188.12")
        and rows[0].volume == 52116
    )
    idx = parse_index_close((FX / "nse_index_close.csv").read_text(encoding="utf-8"))
    nifty = next(i for i in idx if i[0] == "NIFTY 50")
    assert nifty[1] == date(2026, 11, 11) and nifty[3] == Decimal(".84")
    assert direction(float(nifty[3])) == "up"


def test_nav() -> None:
    navs = parse_nav((FX / "amfi_navall.txt").read_text(encoding="utf-8"))
    code, nav, d = navs[0]
    assert code == "135762" and nav == Decimal("28.8435") and d == date(2026, 10, 22)


def test_sebi_register_page() -> None:
    entries, total = parse_register_page((FX / "sebi_ra_page.html").read_text(encoding="utf-8"))
    assert total == 2385 and len(entries) == 3
    assert entries[0].reg_no == "INH300000211" and entries[0].valid_until is None


def test_indian_number() -> None:
    assert feeds.indian_number(1234567) == "12,34,567"
    assert feeds.indian_number(999) == "999"


def test_filters() -> None:
    assert worth_reading("Kaveri: receipt of order", None)
    assert not worth_reading("Copy of newspaper publication", None)
    assert is_denial(
        "Clarification on news item",
        "The company is not in any discussion regarding such a proposal",
    )
    assert not is_denial("Clarification on news item", "The company confirms the board will meet")


class _Doc:
    def __init__(self, title: str, category: str | None = None) -> None:
        self.title, self.category = title, category


def test_routine_filings_not_fanned_out() -> None:
    assert is_routine(_Doc("X Ltd: Copy of Newspaper Publication"))  # type: ignore[arg-type]
    assert is_routine(_Doc("X Ltd", "Trading Window"))  # type: ignore[arg-type]
    assert not is_routine(_Doc("X Ltd: receipt of order"))  # type: ignore[arg-type]


def test_chunking_keeps_title_and_bounds() -> None:
    chunks = chunk_text("Title", "Sentence one. " * 300)
    assert chunks[0].startswith("Title")
    assert all(len(c) <= 900 * 1.5 for c in chunks)


ZERODHA = """Instrument,Qty.,Avg. cost,LTP,Cur. val,P&L,Net chg.,Day chg.
KAVERIPWR,10,150.5,160,1600,95,6.3,1.2
SURYAFIN-SM,25,40,41,1025,25,2.5,0.4
BADROW,,1,1,1,1,1,1
"""


def test_broker_csv_zerodha() -> None:
    s = parse_broker_csv(ZERODHA)
    assert s.label == "Zerodha" and len(s.holdings) == 2
    assert s.holdings[1].symbol == "SURYAFIN"
    assert s.holdings[0].cost == Decimal("1505.0")


# "Script Name" export with section rows and space-padded ISINs (fictional holdings).
SECTIONED = """﻿Script Name,ISIN,Security Type,Sector,Quantity,Avg Unit Cost  ,Invested Value,Current Price,Current Value,Unrealized P&L,Today's P&L,Status
Equity
Kaveri Power Ltd,INE000K01011   ,EQUITY STOCK,Power,13,100.5,1306.5,110,1430,123.5,-2,Active
Surya Finance Ltd,INE000S01022,EQUITY STOCK,Finance,4,50,200,40,160,-40,1,Active

ETF
Example Gold ETF,INF000K01W80   ,ETF,Others,248.0000,10,2480,11,2728,248,-3,Active
"""


def test_broker_csv_sectioned_script_name() -> None:
    s = parse_broker_csv(SECTIONED)
    assert [h.name for h in s.holdings] == [
        "Kaveri Power Ltd",
        "Surya Finance Ltd",
        "Example Gold ETF",
    ]
    k, _, etf = s.holdings
    assert k.isin == "INE000K01011" and k.kind == "equity" and k.cost == Decimal("1306.5")
    assert etf.isin == "INF000K01W80" and etf.kind == "mf_scheme" and etf.qty == Decimal("248")


def test_broker_csv_rejects_unknown_layout() -> None:
    try:
        parse_broker_csv("a,b,c\n1,2,3\n")
    except ImportFailed as exc:
        assert "symbol and quantity" in str(exc)
    else:
        raise AssertionError("expected ImportFailed")
