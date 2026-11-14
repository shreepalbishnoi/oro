"""Pure parsers for public reference files. No I/O here so they're trivially testable."""

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime

# BSE groups for SME platform listings.
BSE_SME_GROUPS = {"M", "MT", "MS"}


@dataclass
class EquityRow:
    isin: str
    name: str
    nse_symbol: str | None = None
    bse_code: str | None = None
    bse_symbol: str | None = None
    series: str | None = None
    is_sme: bool = False
    listed_on: date | None = None


@dataclass
class SchemeRow:
    amfi_code: str
    name: str
    amc: str
    category: str | None
    isin: str | None
    isin_alt: str | None
    plan: str | None = None
    option: str | None = None
    extra: dict[str, str] = field(default_factory=dict)


def _parse_listing_date(raw: str) -> date | None:
    raw = raw.strip()
    for fmt in ("%d-%b-%Y", "%d-%b-%y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _clean_isin(raw: str | None) -> str | None:
    raw = (raw or "").strip().upper()
    return raw if len(raw) == 12 and raw[:2].isalpha() else None


def _dict_rows(text: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    rows = []
    for raw in reader:
        # NSE headers carry stray spaces and both "NAME OF COMPANY" / "NAME_OF_COMPANY" styles.
        rows.append(
            {
                (k or "").strip().upper().replace(" ", "_"): (v or "").strip()
                for k, v in raw.items()
                if k
            }
        )
    return rows


def parse_nse_equity_list(text: str, *, sme: bool = False) -> list[EquityRow]:
    """NSE EQUITY_L.csv (main board) or SME_EQUITY_L.csv (Emerge)."""
    out = []
    for r in _dict_rows(text):
        isin = _clean_isin(r.get("ISIN_NUMBER"))
        symbol = r.get("SYMBOL")
        if not isin or not symbol:
            continue
        out.append(
            EquityRow(
                isin=isin,
                name=r.get("NAME_OF_COMPANY", "").strip() or symbol,
                nse_symbol=symbol.upper(),
                series=r.get("SERIES") or None,
                is_sme=sme,
                listed_on=_parse_listing_date(r.get("DATE_OF_LISTING", "")),
            )
        )
    return out


def parse_bse_bhavcopy(text: str) -> list[EquityRow]:
    """BSE UDiFF equity bhavcopy; we only need the instrument columns, not prices."""
    out = []
    for r in _dict_rows(text):
        if r.get("FININSTRMTP") != "STK":
            continue
        isin = _clean_isin(r.get("ISIN"))
        # INE = Indian equity issuers; skips ETFs/MF units (INF) and debt.
        if not isin or not isin.startswith("INE"):
            continue
        group = (r.get("SCTYSRS") or "").upper()
        out.append(
            EquityRow(
                isin=isin,
                name=r.get("FININSTRMNM", "").strip(),
                bse_code=r.get("FININSTRMID") or None,
                bse_symbol=(r.get("TCKRSYMB") or "").upper() or None,
                series=group or None,
                is_sme=group in BSE_SME_GROUPS,
            )
        )
    return out


def parse_amfi_navall(text: str) -> list[SchemeRow]:
    """AMFI NAVAll.txt: semicolon rows grouped under category and AMC header lines."""
    lines = text.lstrip("﻿").splitlines()
    if not lines:
        return []
    header = [h.strip().lower() for h in lines[0].split(";")]
    has_plan = "plan" in header and "option" in header

    out: list[SchemeRow] = []
    category: str | None = None
    amc: str | None = None
    seen_codes: set[str] = set()
    for line in lines[1:]:
        stripped = line.strip()
        if not stripped:
            continue
        if ";" not in stripped:
            if "Schemes(" in stripped:
                inner = stripped.split("(", 1)[1].rstrip(")")
                category = inner.strip()
            else:
                amc = stripped
            continue
        parts = [p.strip() for p in stripped.split(";")]
        if has_plan and len(parts) >= 8:
            code, isin1, isin2, name, plan, option = parts[:6]
        elif len(parts) >= 6:
            code, isin1, isin2, name = parts[:4]
            plan = option = None
        else:
            continue
        if not code.isdigit() or code in seen_codes or amc is None:
            continue
        seen_codes.add(code)
        out.append(
            SchemeRow(
                amfi_code=code,
                name=name,
                amc=amc,
                category=category,
                isin=_clean_isin(isin1),
                isin_alt=_clean_isin(isin2),
                plan=plan or None,
                option=option or None,
            )
        )
    return out


def merge_equities(
    nse: list[EquityRow], nse_sme: list[EquityRow], bse: list[EquityRow]
) -> list[EquityRow]:
    """Join exchanges on ISIN. NSE name wins (proper case); BSE contributes code + SME flag."""
    by_isin: dict[str, EquityRow] = {}
    for row in [*nse, *nse_sme]:
        by_isin.setdefault(row.isin, row)
    for row in bse:
        existing = by_isin.get(row.isin)
        if existing is None:
            by_isin[row.isin] = row
            continue
        existing.bse_code = existing.bse_code or row.bse_code
        existing.bse_symbol = existing.bse_symbol or row.bse_symbol
        existing.is_sme = existing.is_sme or row.is_sme
    return list(by_isin.values())
