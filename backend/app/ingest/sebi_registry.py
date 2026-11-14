"""SEBI register of research analysts (intmId=14) and investment advisers (intmId=13).

The register is an HTML list, 25 cards per page. Paging posts the page's own form; SEBI blocks
aggressive clients, so pages are fetched slowly and the run stops at the first failure
(the next weekly run resumes). Only name, registration number and validity are kept."""

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime

import httpx
from selectolax.lexbor import LexborHTMLParser
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingest.reference.normalize import normalize_name
from app.models import RegisteredIntermediary

logger = logging.getLogger(__name__)

URL = "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId={intm}"
KIND = {14: "RA", 13: "IA"}
_REG = re.compile(r"^IN[AH]\d{9}$")
_TOTAL = re.compile(r"of\s+([\d,]+)\s+records")


@dataclass
class RegEntry:
    reg_no: str
    name: str
    valid_until: date | None


def _valid_until(raw: str) -> date | None:
    # "Apr 13, 2026 - Perpetual" or "Jan 02, 2022 - Jan 01, 2027"
    parts = [p.strip() for p in raw.split("-")]
    if len(parts) < 2 or parts[-1].lower().startswith("perpetual"):
        return None
    try:
        return datetime.strptime(parts[-1], "%b %d, %Y").date()
    except ValueError:
        return None


def parse_register_page(html: str) -> tuple[list[RegEntry], int | None]:
    tree = LexborHTMLParser(html)
    out: list[RegEntry] = []
    for block in tree.css("div.fixed-table-body.card-table"):
        fields: dict[str, str] = {}
        for card in block.css("div.card-view"):
            title = card.css_first("div.title")
            value = card.css_first("div.value")
            if title and value:
                fields[title.text(strip=True)] = value.text(strip=True)
        reg = fields.get("Registration No.", "").upper()
        name = fields.get("Name", "")
        if _REG.match(reg) and name:
            out.append(RegEntry(reg, name, _valid_until(fields.get("Validity", ""))))
    m = _TOTAL.search(html)
    total = int(m.group(1).replace(",", "")) if m else None
    return out, total


async def upsert(session: AsyncSession, entries: list[RegEntry], kind: str) -> int:
    today = date.today()
    for e in entries:
        stmt = insert(RegisteredIntermediary).values(
            kind=kind, reg_no=e.reg_no, name=e.name, name_norm=normalize_name(e.name),
            valid_until=e.valid_until, as_of=today,
        )  # fmt: skip
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=[RegisteredIntermediary.reg_no],
                set_={
                    "name": e.name,
                    "name_norm": normalize_name(e.name),
                    "valid_until": e.valid_until,
                    "as_of": today,
                },
            )
        )
    await session.commit()
    return len(entries)


async def refresh(
    session: AsyncSession, client: httpx.AsyncClient, intm: int = 14, delay_s: float = 2.0
) -> int:
    url = URL.format(intm=intm)
    resp = await client.get(url)
    resp.raise_for_status()
    entries, total = parse_register_page(resp.text)
    n = await upsert(session, entries, KIND[intm])
    pages = ((total or 0) + 24) // 25
    for page in range(1, pages):
        await asyncio.sleep(delay_s)
        try:
            r = await client.post(
                url, data={"nextValue": str(page), "next": "n", "intmId": str(intm)}
            )
            r.raise_for_status()
            batch, _ = parse_register_page(r.text)
        except httpx.HTTPError as exc:
            logger.warning("SEBI register paging stopped at page %d: %s", page, type(exc).__name__)
            break
        if not batch:
            break
        n += await upsert(session, batch, KIND[intm])
    return n
