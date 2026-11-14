"""Market mood (PLAN §7 display rules): direction of the last close only, never an index level
or a live/delayed quote, until counsel clears showing values."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

INDICES = ("NIFTY 50", "NIFTY 500", "NIFTY MIDCAP 150", "NIFTY SMALLCAP 250")
FLAT_BAND = 0.15  # % moves inside ±0.15 read as flat


def direction(change_pct: float | None) -> str:
    if change_pct is None:
        return "unknown"
    if change_pct > FLAT_BAND:
        return "up"
    if change_pct < -FLAT_BAND:
        return "down"
    return "flat"


def strength(change_pct: float | None) -> str:
    a = abs(change_pct or 0)
    return "strong" if a >= 1.5 else "moderate" if a >= 0.5 else "mild"


async def mood(session: AsyncSession) -> dict:
    rows = await session.execute(
        text(
            "SELECT DISTINCT ON (index_name) index_name, trade_date, change_pct FROM index_eod "
            "WHERE index_name = ANY(:names) ORDER BY index_name, trade_date DESC"
        ),
        {"names": list(INDICES)},
    )
    items = [
        {
            "index": r.index_name,
            "direction": direction(float(r.change_pct) if r.change_pct is not None else None),
            "strength": strength(float(r.change_pct) if r.change_pct is not None else None),
            "asOf": r.trade_date.isoformat(),
        }
        for r in rows
    ]
    lead = next((i for i in items if i["index"] == "NIFTY 50"), items[0] if items else None)
    return {
        "direction": lead["direction"] if lead else "unknown",
        "strength": lead["strength"] if lead else "mild",
        "asOf": lead["asOf"] if lead else None,
        "indices": items,
        "note": "Direction of the last close only. ORO doesn't show live or delayed prices.",
    }
