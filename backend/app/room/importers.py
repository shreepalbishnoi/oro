"""Statement importers (PLAN §9.4): CAS PDF (CAMS/KFintech/NSDL/CDSL via casparser) and broker
holdings CSVs (Zerodha, Groww, Upstox, Angel One). Pure: bytes in, normalised rows out.

The CAS file and password exist only in memory for the duration of the call; nothing here
writes to disk or logs their contents."""

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation


class ImportFailed(Exception):
    """User-facing: the message is shown as-is."""


@dataclass
class ParsedHolding:
    name: str
    qty: Decimal
    isin: str | None = None
    amfi: str | None = None
    symbol: str | None = None
    cost: Decimal | None = None  # total cost in ₹
    kind: str = "equity"  # equity | mf_scheme


@dataclass
class ParsedStatement:
    source: str  # cas | csv
    label: str
    statement_date: date | None
    holdings: list[ParsedHolding] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _dec(v: object) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v).replace(",", "").strip())
    except InvalidOperation:
        return None


def _get(obj: object, key: str) -> object:
    return obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)


def parse_cas(data: bytes, password: str) -> ParsedStatement:
    import casparser
    from casparser.exceptions import CASParseError, IncorrectPasswordError

    if not data.startswith(b"%PDF-"):
        raise ImportFailed("That file isn't a PDF. Upload the CAS PDF you received by email.")
    try:
        cas = casparser.read_cas_pdf(io.BytesIO(data), password, output="dict")
    except IncorrectPasswordError as exc:
        raise ImportFailed(
            "Wrong password. CAS passwords are usually your PAN in capitals."
        ) from exc
    except CASParseError as exc:
        raise ImportFailed(
            "We couldn't read this statement. Try a CAS from CAMS, KFintech, NSDL or CDSL, or import a broker CSV instead."
        ) from exc

    period = _get(cas, "statement_period") or {}
    to = _get(period, "to")
    stmt_date = None
    if isinstance(to, date):
        stmt_date = to
    elif isinstance(to, str):
        for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                from datetime import datetime

                stmt_date = datetime.strptime(to, fmt).date()
                break
            except ValueError:
                continue

    out = ParsedStatement(source="cas", label="CAS", statement_date=stmt_date)
    out.warnings = [str(w) for w in (_get(cas, "parse_warnings") or [])][:5]

    # CAMS / KFintech: folios -> schemes
    for folio in _get(cas, "folios") or []:
        for s in _get(folio, "schemes") or []:
            units = _dec(_get(s, "close"))
            if not units or units <= 0:
                continue
            val = _get(s, "valuation") or {}
            out.holdings.append(
                ParsedHolding(
                    name=str(_get(s, "scheme") or ""),
                    qty=units,
                    isin=_get(s, "isin"),
                    amfi=str(_get(s, "amfi") or "") or None,
                    cost=_dec(_get(val, "cost")),
                    kind="mf_scheme",
                )  # fmt: skip
            )
    # NSDL / CDSL: demat accounts -> equities + mutual funds
    for acct in _get(cas, "accounts") or []:
        for e in _get(acct, "equities") or []:
            qty = _dec(_get(e, "num_shares"))
            if qty and qty > 0:
                out.holdings.append(
                    ParsedHolding(
                        name=str(_get(e, "name") or ""),
                        qty=qty,
                        isin=_get(e, "isin"),
                        symbol=_get(e, "symbol"),
                    )
                )
        for m in _get(acct, "mutual_funds") or []:
            qty = _dec(_get(m, "balance"))
            if qty and qty > 0:
                out.holdings.append(
                    ParsedHolding(
                        name=str(_get(m, "name") or ""),
                        qty=qty,
                        isin=_get(m, "isin"),
                        amfi=str(_get(m, "amfi") or "") or None,
                        cost=_dec(_get(m, "total_cost")),
                        kind="mf_scheme",
                    )  # fmt: skip
                )
    if not out.holdings:
        raise ImportFailed("This statement has no current holdings to import.")
    return out


SYMBOL_COLS = re.compile(
    r"^(instrument|symbol|trading ?symbol|scrip( name)?|script( name)?|stock( name)?"
    r"|company( name)?|security( name)?)$",
    re.I,
)
QTY_COLS = re.compile(r"^(qty\.?|quantity|quantity available|net qty|holding qty|units)$", re.I)
ISIN_COLS = re.compile(r"^isin( code)?$", re.I)
AVG_COLS = re.compile(
    r"^(avg\.? ?cost|average (buy )?price|avg\.? ?price|average cost|avg\.? unit cost)$", re.I
)
INVESTED_COLS = re.compile(r"^(invested( value| amount)?|buy value|cost value)$", re.I)
TYPE_COLS = re.compile(r"^(security type|instrument type|asset (class|type)|type)$", re.I)


def _broker(header: list[str]) -> str:
    h = " ".join(header).lower()
    if "avg. cost" in h:
        return "Zerodha"
    if "stock name" in h:
        return "Groww"
    if "script name" in h:
        return "Broker"  # several brokers share this export; we don't guess which
    if "scrip" in h:
        return "Upstox"
    if "symbol" in h:
        return "Angel One"
    return "Broker"


def parse_broker_csv(text: str) -> ParsedStatement:
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    h_idx = next(
        (
            i
            for i, r in enumerate(rows)
            if any(SYMBOL_COLS.match(c.strip()) for c in r)
            and any(QTY_COLS.match(c.strip()) for c in r)
        ),
        None,
    )
    if h_idx is None:
        raise ImportFailed(
            "Couldn't find symbol and quantity columns. Export 'Holdings' as CSV from your broker and try again."
        )
    header = [c.strip() for c in rows[h_idx]]

    def col(pat: re.Pattern[str]) -> int | None:
        return next((i for i, c in enumerate(header) if pat.match(c)), None)

    si, qi, ii, ai = col(SYMBOL_COLS), col(QTY_COLS), col(ISIN_COLS), col(AVG_COLS)
    vi, ti = col(INVESTED_COLS), col(TYPE_COLS)
    assert si is not None and qi is not None
    broker = _broker(header)
    out = ParsedStatement(source="csv", label=broker, statement_date=None)

    def cell(r: list[str], i: int | None) -> str:
        return r[i].strip() if i is not None and i < len(r) else ""

    # Section rows ("Equity", "ETF", blank lines, totals) have no positive quantity and are skipped.
    for r in rows[h_idx + 1 :]:
        if len(r) <= max(si, qi):
            continue
        raw = re.sub(r"-(EQ|BE|SM|BZ)$", "", r[si].strip(), flags=re.I)
        qty = _dec(r[qi])
        if not raw or not qty or qty <= 0:
            continue
        avg = _dec(cell(r, ai))
        invested = _dec(cell(r, vi))
        isin = cell(r, ii).upper() or None
        isin = isin if isin and re.fullmatch(r"IN[A-Z0-9]{10}", isin) else None
        sec_type = cell(r, ti).lower()
        # MF units and ETFs carry INF ISINs; they resolve against AMFI schemes and value at NAV.
        is_fund = bool(isin and isin.startswith("INF")) or "etf" in sec_type or "mutual" in sec_type
        out.holdings.append(
            ParsedHolding(
                name=raw,
                qty=qty,
                symbol=raw.upper() if re.fullmatch(r"[A-Za-z0-9&-]{1,20}", raw) else None,
                isin=isin,
                cost=invested if invested else ((avg * qty) if avg else None),
                kind="mf_scheme" if is_fund else "equity",
            )  # fmt: skip
        )
    if not out.holdings:
        raise ImportFailed("No holdings with a positive quantity were found in this file.")
    return out
