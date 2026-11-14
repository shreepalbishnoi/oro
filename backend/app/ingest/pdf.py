"""Filing PDF text (PLAN §M1): fetch with a size cap, extract text in memory with pypdfium2.
PDFs are never stored, only extracted text and the source URL (PLAN §6.3 disk budget)."""

import asyncio
import logging
import re

import httpx

logger = logging.getLogger(__name__)

MAX_BYTES = 8 * 1024 * 1024
MAX_PAGES = 8
MAX_CHARS = 20_000

# Filings worth reading in full; routine notices keep just their exchange summary.
WORTH_READING = re.compile(
    r"order|contract|award|acqui|merger|amalgam|scheme of arrangement|clarification|press release|"
    r"outcome of board|\bresults?\b|dividend|bonus|split|buyback|fund rais|preferential|qip|"
    r"pledge|resign|auditor|credit rating|default|insolvency|sebi|investigation|fraud|litigation",
    re.I,
)


def worth_reading(title: str, category: str | None) -> bool:
    return bool(WORTH_READING.search(f"{title} {category or ''}"))


async def fetch_pdf(client: httpx.AsyncClient, url: str) -> bytes | None:
    try:
        async with client.stream("GET", url) as resp:
            if resp.status_code != 200:
                return None
            if int(resp.headers.get("content-length") or 0) > MAX_BYTES:
                return None
            buf = bytearray()
            async for chunk in resp.aiter_bytes():
                buf.extend(chunk)
                if len(buf) > MAX_BYTES:
                    return None
            return bytes(buf) if buf[:5] == b"%PDF-" else None
    except httpx.HTTPError:
        return None


def pdf_text(data: bytes) -> str:
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(data)
    try:
        parts = []
        for i in range(min(len(doc), MAX_PAGES)):
            page = doc[i]
            tp = page.get_textpage()
            parts.append(tp.get_text_range())
            tp.close()
            page.close()
            if sum(len(p) for p in parts) > MAX_CHARS:
                break
    finally:
        doc.close()
    text = re.sub(r"[ \t]+", " ", "\n".join(parts))
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:MAX_CHARS]


async def extract(client: httpx.AsyncClient, url: str) -> str:
    data = await fetch_pdf(client, url)
    if not data:
        return ""
    try:
        return await asyncio.to_thread(pdf_text, data)
    except Exception:  # noqa: BLE001 - malformed PDFs are common; keep the summary
        logger.warning("pdf text failed: %s", url)
        return ""
