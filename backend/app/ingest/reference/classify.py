"""Industry and business-group labels for listed equities (drives X-ray groups/sectors, shock
simulator targets and Discover's "connected companies").

- Industry: NSE index constituent files (Nifty Total Market = 750 stocks, Microcap 250), keyed
  by ISIN. Stocks outside them keep industry NULL and show as "Other".
- Group: a hand-curated map of large Indian promoter groups, matched on the company name. Only
  groups whose listed companies are unambiguous by name are included; when in doubt, leave it out
  (a wrong group label would overstate someone's concentration).
"""

import csv
import io
import re

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

INDUSTRY_URLS = (
    "https://niftyindices.com/IndexConstituent/ind_niftytotalmarket_list.csv",
    "https://niftyindices.com/IndexConstituent/ind_niftymicrocap250_list.csv",
)

# group -> name patterns (lower-case company name, "limited/ltd" stripped)
GROUPS: dict[str, tuple[str, ...]] = {
    "Tata": (
        r"^tata\b",
        r"^titan company",
        r"^voltas",
        r"^trent\b",
        r"^the indian hotels",
        r"^indian hotels",
        r"^rallis india",
        r"^tejas networks",
        r"^nelco\b",
        r"^automobile corporation of goa",
    ),
    "Reliance (Mukesh Ambani)": (
        r"^reliance industries",
        r"^jio financial",
        r"^network18",
        r"^tv18",
        r"^hathway cable",
        r"^den networks",
        r"^just dial",
        r"^alok industries",
        r"^reliance industrial infrastructure",
    ),
    "Adani": (
        r"^adani\b",
        r"^ambuja cements",
        r"^acc\b",
        r"^new delhi television",
        r"^sanghi industries",
    ),
    "Aditya Birla": (
        r"^aditya birla",
        r"^grasim",
        r"^ultratech cement",
        r"^hindalco",
        r"^vodafone idea",
    ),
    "Mahindra": (r"^mahindra\b", r"^tech mahindra", r"^swaraj engines"),
    "Bajaj": (r"^bajaj (finance|finserv|auto|holdings)",),
    "HDFC": (r"^hdfc\b",),
    "ICICI": (r"^icici\b",),
    "Kotak": (r"^kotak mahindra",),
    "SBI": (r"^state bank of india", r"^sbi\b"),
    "Larsen & Toubro": (
        r"^larsen\s*&\s*toubro",
        r"^l\s*&\s*t\b",
        r"^ltimindtree",
        r"^lti mindtree",
    ),
    "Vedanta": (r"^vedanta\b", r"^hindustan zinc"),
    "JSW": (r"^jsw\b",),
    "Godrej": (r"^godrej\b",),
    "Murugappa": (
        r"^tube investments of india",
        r"^cholamandalam",
        r"^coromandel international",
        r"^carborundum universal",
        r"^e\.?i\.?d\.?[- ]parry",
        r"^shanthi gears",
    ),
    "TVS": (r"^tvs\b",),
    "Hinduja": (r"^ashok leyland", r"^indusind bank", r"^gulf oil lubricants", r"^hinduja global"),
    "Bharti": (r"^bharti airtel", r"^bharti hexacom"),
    "Wadia": (r"^britannia industries", r"^bombay dyeing", r"^bombay burmah"),
    "RP-Sanjiv Goenka": (
        r"^cesc\b",
        r"^pcbl\b",
        r"^firstsource solutions",
        r"^spencer'?s retail",
        r"^saregama",
    ),
    "Piramal": (r"^piramal\b",),
    "Torrent": (r"^torrent (pharmaceuticals|power)",),
    "Shriram": (r"^shriram (finance|properties)",),
    "Zydus": (r"^zydus\b",),
    "Hero": (r"^hero motocorp",),
}
_COMPILED = [(g, re.compile("|".join(p))) for g, p in GROUPS.items()]
_SUFFIX = re.compile(r"\b(limited|ltd\.?)$")


def group_for(name: str) -> str | None:
    n = _SUFFIX.sub("", name.strip().lower()).strip()
    for g, rx in _COMPILED:
        if rx.search(n):
            return g
    return None


def parse_industries(text_: str) -> dict[str, str]:
    """ISIN -> industry from a niftyindices constituent CSV."""
    out: dict[str, str] = {}
    for row in csv.DictReader(io.StringIO(text_.lstrip("﻿"))):
        isin = (row.get("ISIN Code") or "").strip().upper()
        ind = (row.get("Industry") or "").strip()
        if len(isin) == 12 and ind:
            out[isin] = ind
    return out


async def fetch_industries(client: httpx.AsyncClient) -> dict[str, str]:
    merged: dict[str, str] = {}
    for url in INDUSTRY_URLS:
        try:
            resp = await client.get(url, timeout=30)
            resp.raise_for_status()
            merged.update({k: v for k, v in parse_industries(resp.text).items() if k not in merged})
        except httpx.HTTPError:
            continue  # partial coverage is fine; the next nightly run fills gaps
    return merged


async def apply_labels(session: AsyncSession, industries: dict[str, str]) -> dict[str, int]:
    n_ind = 0
    if industries:
        res = await session.execute(
            text(
                """
                UPDATE instruments i SET industry = v.industry
                FROM unnest(CAST(:isins AS text[]), CAST(:inds AS text[])) AS v(isin, industry)
                WHERE i.isin = v.isin AND i.kind = 'equity' AND i.industry IS DISTINCT FROM v.industry
                """
            ),
            {"isins": list(industries), "inds": list(industries.values())},
        )
        n_ind = res.rowcount or 0
    rows = (
        await session.execute(
            text("SELECT id, name, group_name FROM instruments WHERE kind = 'equity'")
        )
    ).all()
    changes = [(r.id, g) for r in rows if (g := group_for(r.name)) != r.group_name]
    for iid, g in changes:
        await session.execute(
            text("UPDATE instruments SET group_name = :g WHERE id = :i"), {"g": g, "i": iid}
        )
    return {
        "industry_updated": n_ind,
        "industry_known": len(industries),
        "groups_changed": len(changes),
    }
