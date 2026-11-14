from datetime import date
from pathlib import Path

from app.ingest.reference.normalize import normalize_name
from app.ingest.reference.parsers import (
    merge_equities,
    parse_amfi_navall,
    parse_bse_bhavcopy,
    parse_nse_equity_list,
)

FIXTURES = Path(__file__).parent / "fixtures"


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_nse_main_board_list() -> None:
    rows = parse_nse_equity_list(read("nse_equity_l.csv"))
    assert len(rows) == 5
    first = rows[0]
    assert first.nse_symbol == "20MICRONS"
    assert first.isin == "INE144J01027"
    assert first.name == "20 Microns Limited"
    assert first.listed_on == date(2008, 10, 6)
    assert first.is_sme is False


def test_nse_sme_list_two_digit_year() -> None:
    rows = parse_nse_equity_list(read("nse_sme_equity_l.csv"), sme=True)
    assert rows[0].nse_symbol == "RAVITA"
    assert rows[0].series == "ST"
    assert rows[0].listed_on == date(2026, 10, 22)
    assert all(r.is_sme for r in rows)


def test_bse_bhavcopy_codes_and_sme_groups() -> None:
    rows = parse_bse_bhavcopy(read("bse_bhavcopy.csv"))
    by_code = {r.bse_code: r for r in rows}
    assert by_code["500002"].isin == "INE117A01022"
    assert by_code["500002"].bse_symbol == "ABB"
    assert by_code["500002"].is_sme is False
    assert by_code["534708"].is_sme is True  # group M = BSE SME platform


def test_amfi_groups_amc_and_category() -> None:
    rows = parse_amfi_navall(read("amfi_navall.txt"))
    axis = rows[0]
    assert axis.amfi_code == "135762"
    assert axis.amc == "Axis Mutual Fund"
    assert axis.category == "Children’s Fund - Childrens' Fund"
    assert axis.isin == "INF846K01WO1"
    assert axis.isin_alt is None
    assert axis.plan == "Direct Plan"

    reinvest = next(r for r in rows if r.amfi_code == "135763")
    assert reinvest.isin_alt == "INF846K01WQ6"

    franklin = rows[-1]
    assert franklin.amc == "Franklin Templeton Mutual Fund"
    assert franklin.category == "Debt Scheme - Banking and PSU Fund"


def test_amfi_legacy_six_column_format() -> None:
    text = (
        "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;"
        "Net Asset Value;Date\n\nOpen Ended Schemes(Equity Scheme - Large Cap Fund)\n\n"
        "HDFC Mutual Fund\n\n100001;INF179K01BE2;-;HDFC Top 100 Fund - Growth;1000.1;22-Oct-2026\n"
    )
    rows = parse_amfi_navall(text)
    assert len(rows) == 1
    assert rows[0].amc == "HDFC Mutual Fund"
    assert rows[0].plan is None


def test_merge_prefers_nse_name_and_adds_bse_code() -> None:
    nse = parse_nse_equity_list(
        "SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER,"
        " FACE VALUE\nABB,ABB India Limited,EQ,01-JAN-1995,2,1,INE117A01022,2\n"
    )
    bse = parse_bse_bhavcopy(read("bse_bhavcopy.csv"))
    merged = {r.isin: r for r in merge_equities(nse, [], bse)}
    abb = merged["INE117A01022"]
    assert abb.name == "ABB India Limited"
    assert abb.nse_symbol == "ABB"
    assert abb.bse_code == "500002"
    # BSE-only listing still lands in the master.
    assert merged["INE208C01025"].bse_code == "500003"
    assert merged["INE208C01025"].nse_symbol is None


def test_normalize_name() -> None:
    assert normalize_name("Tata Motors Ltd.") == "tata motors"
    assert normalize_name("TATA MOTORS LIMITED") == "tata motors"
    assert normalize_name("Larsen & Toubro Limited") == "larsen and toubro"
    assert normalize_name("रिलायंस इंडस्ट्रीज") == "रिलायंस इंडस्ट्रीज"


def test_group_map_matches_names_not_lookalikes() -> None:
    from app.ingest.reference.classify import group_for

    assert group_for("Tata Consultancy Services Limited") == "Tata"
    assert group_for("Titan Company Limited") == "Tata"
    assert group_for("PCBL Chemical Limited") == "RP-Sanjiv Goenka"
    assert group_for("L&T Finance Limited") == "Larsen & Toubro"
    assert group_for("Tatva Chintan Pharma Chem Limited") is None
    assert group_for("Accelya Solutions India Limited") is None
    assert group_for("Bajaj Electricals Limited") is None  # different family; left out on purpose


def test_parse_industries_keys_by_isin() -> None:
    from app.ingest.reference.classify import parse_industries

    csv_text = "﻿Company Name,Industry,Symbol,Series,ISIN Code\nABB India Ltd.,Capital Goods,ABB,EQ,INE117A01022\nBad,,X,EQ,\n"
    assert parse_industries(csv_text) == {"INE117A01022": "Capital Goods"}
