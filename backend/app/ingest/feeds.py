"""Parsers for public sources (PLAN §7). Pure functions over bytes, tested on real samples.

XML is parsed with defusedxml (no entity expansion, no external entities)."""

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

from defusedxml import ElementTree as ET

from app.pipeline.store import RawItem

IST = ZoneInfo("Asia/Kolkata")

_DATE_FORMATS = (
    "%d-%b-%Y %H:%M:%S",  # NSE / BSE RSS: 11-Nov-2026 21:53:38
    "%d-%b-%Y %H:%M",  # NSE insider: 02-May-2026 16:46
    "%d %b %Y %H:%M:%S",  # SEBI lastBuildDate
    "%d %b, %Y %z",  # SEBI items: 11 Nov, 2026 +0530
    "%d-%b-%Y",
)


def parse_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    s = raw.strip()
    try:
        dt = parsedate_to_datetime(s)  # RFC 822 with zone (news feeds, SEBI pubDate)
        return dt if dt.tzinfo else dt.replace(tzinfo=IST)
    except (TypeError, ValueError, IndexError):
        pass
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=IST)
        except ValueError:
            continue
    return None


def _text(el, tag: str) -> str:  # type: ignore[no-untyped-def]
    child = el.find(tag)
    return (child.text or "").strip() if child is not None and child.text else ""


def _items(xml: bytes):  # type: ignore[no-untyped-def]
    root = ET.fromstring(xml.lstrip(b"\xef\xbb\xbf"))
    return root.iter("item")


_NSE_SYMBOL = re.compile(r"/corporate/([A-Z0-9&-]+?)_\d{8,}")
_SUBJECT = re.compile(r"\|\s*SUBJECT:\s*(.+)$", re.I)


def parse_nse_announcements(xml: bytes) -> list[RawItem]:
    out = []
    for it in _items(xml):
        link, title, desc = _text(it, "link"), _text(it, "title"), _text(it, "description")
        published = parse_date(_text(it, "pubDate"))
        if not link or not published:
            continue
        sym = _NSE_SYMBOL.search(link)
        subj = _SUBJECT.search(desc)
        body = _SUBJECT.sub("", desc).strip()
        category = subj.group(1).strip() if subj else None
        out.append(
            RawItem(
                url=link,
                title=f"{title}: {category}" if category else title,
                body=body,
                published_at=published,
                category=category,
                symbol_hint=sym.group(1) if sym else None,
            )
        )
    return out


_NAV_NOTICE = re.compile(r"\bNAV\b|net asset value", re.I)
_BSE_TITLE = re.compile(r"^(.*?)\s*\((\d{6})\)\s*$")


def parse_bse_announcements(xml: bytes) -> list[RawItem]:
    out = []
    for it in _items(xml):
        link, title, desc = _text(it, "link"), _text(it, "title"), _text(it, "description")
        published = parse_date(_text(it, "pubDate"))
        if not link or not published:
            continue
        m = _BSE_TITLE.match(title)
        code = _text(it, "scripcode") or (m.group(2) if m else None)
        name = m.group(1) if m else title
        # Debt-only issuers (NCD interest notices) carry 9xxxxx codes; fund NAV notices are
        # daily noise. Neither says anything about a listed company.
        if (code and code.startswith("9")) or _NAV_NOTICE.search(f"{title} {desc}"):
            continue
        out.append(
            RawItem(
                url=link,
                title=f"{name}: {desc[:140]}" if desc else name,
                body=desc,
                published_at=published,
                category=None,
                symbol_hint=code,
            )
        )
    return out


# SEBI recovery proceedings name individual defaulters (often with PANs, even in URLs). They
# say nothing about listed companies, so they're never ingested.
_SEBI_SKIP = re.compile(
    r"recovery certificate|release order|attachment order|demand notice|recovery proceedings", re.I
)


def parse_rss(xml: bytes) -> list[RawItem]:
    """Generic RSS (SEBI, news). News keeps headline + short summary only (display rules)."""
    out = []
    for it in _items(xml):
        link, title = _text(it, "link"), _text(it, "title")
        if _SEBI_SKIP.search(title) or "/recovery-proceedings/" in link:
            continue
        published = parse_date(_text(it, "pubDate")) or parse_date(
            _text(it, "{http://purl.org/dc/elements/1.1/}date")
        )
        if not link or not title or not published:
            continue
        desc = re.sub(r"<[^>]+>", " ", _text(it, "description"))
        desc = re.sub(r"\s+", " ", desc).strip()[:600]
        out.append(RawItem(url=link, title=title, body=desc, published_at=published))
    return out


@dataclass
class DealRow:
    deal_date: date
    symbol: str
    name: str
    party: str
    side: str
    quantity: int
    price: float


def parse_deals_csv(text: str) -> list[DealRow]:
    """NSE bulk.csv / block.csv."""
    out = []
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    for row in reader:
        r = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        try:
            out.append(
                DealRow(
                    deal_date=datetime.strptime(r["Date"], "%d-%b-%Y").date(),
                    symbol=r["Symbol"],
                    name=r.get("Security Name", ""),
                    party=r["Client Name"],
                    side=r["Buy/Sell"].upper(),
                    quantity=int(float(r["Quantity Traded"].replace(",", ""))),
                    price=float(r["Trade Price / Wght. Avg. Price"].replace(",", "")),
                )
            )
        except (KeyError, ValueError):
            continue
    return out


@dataclass
class InsiderTrade:
    symbol: str
    person: str
    category: str
    side: str
    quantity: int | None
    mode: str
    trade_date: date | None


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_insider_xbrl(xml: bytes) -> list[InsiderTrade]:
    """SEBI PIT Reg 7(2) disclosure (NSE XBRL). One file can hold several transactions."""
    root = ET.fromstring(xml)
    by_ctx: dict[str, dict[str, str]] = {}
    for el in root.iter():
        ctx = el.get("contextRef")
        if ctx and el.text and el.text.strip():
            by_ctx.setdefault(ctx, {})[_local(el.tag)] = el.text.strip()
    symbol = next((v["NSESymbol"] for v in by_ctx.values() if "NSESymbol" in v), "")
    out = []
    for fields in by_ctx.values():
        if "SecuritiesAcquiredOrDisposedTransactionType" not in fields:
            continue
        qty = fields.get("SecuritiesAcquiredOrDisposedNumberOfSecurity")
        d = fields.get("DateOfAllotmentAdviceOrAcquisitionOfSharesOrSaleOfSharesSpecifyFromDate")
        out.append(
            InsiderTrade(
                symbol=symbol,
                person=fields.get("NameOfThePerson", "Not disclosed"),
                category=fields.get("CategoryOfPerson", ""),
                side=fields["SecuritiesAcquiredOrDisposedTransactionType"],
                quantity=int(float(qty)) if qty else None,
                mode=fields.get("ModeOfAcquisitionOrDisposal", ""),
                trade_date=date.fromisoformat(d[:10]) if d else None,
            )
        )
    # Person/category may sit in a different context than the transaction; fill from any.
    person = next((v["NameOfThePerson"] for v in by_ctx.values() if "NameOfThePerson" in v), None)
    category = next((v["CategoryOfPerson"] for v in by_ctx.values() if "CategoryOfPerson" in v), "")
    for t in out:
        if t.person == "Not disclosed" and person:
            t.person = person
        if not t.category:
            t.category = category
    return out


def indian_number(n: int) -> str:
    """1234567 -> 12,34,567"""
    s = str(n)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts) + "," + tail
