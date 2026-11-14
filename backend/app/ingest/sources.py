"""Source catalogue (PLAN §7). Seeded into `sources` on start; per-source state lives there."""

from dataclasses import dataclass

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Source

NSE_RSS = "https://nsearchives.nseindia.com/content/RSS/"


@dataclass(frozen=True)
class SourceDef:
    slug: str
    name: str
    tier: int
    url: str
    parser: str  # key in poller.PARSERS
    poll_market_s: int
    poll_off_s: int
    kind: str = "rss"


CATALOGUE: tuple[SourceDef, ...] = (
    SourceDef("nse-announcements", "NSE filing", 1, f"{NSE_RSS}Online_announcements.xml", "nse", 60, 300),
    SourceDef("bse-announcements", "BSE filing", 1, "https://www.bseindia.com/data/xml/announcements.xml", "bse", 90, 600),
    SourceDef("nse-insider", "NSE insider trading (PIT)", 1, f"{NSE_RSS}Insider_Trading.xml", "insider", 900, 1800),
    SourceDef("sebi-rss", "SEBI", 2, "https://www.sebi.gov.in/sebirss.xml", "rss", 900, 1800),
    SourceDef("et-markets", "Economic Times", 3, "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms", "rss", 180, 900),
    SourceDef("mint-markets", "Mint", 3, "https://www.livemint.com/rss/markets", "rss", 180, 900),
)  # fmt: skip


async def sync_catalogue(session: AsyncSession) -> None:
    for d in CATALOGUE:
        stmt = insert(Source).values(
            slug=d.slug, name=d.name, tier=d.tier, kind=d.kind, url=d.url,
            poll_market_s=d.poll_market_s, poll_off_s=d.poll_off_s,
        )  # fmt: skip
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=[Source.slug],
                set_={
                    "name": d.name,
                    "tier": d.tier,
                    "url": d.url,
                    "poll_market_s": d.poll_market_s,
                    "poll_off_s": d.poll_off_s,
                },
            )
        )
    await session.commit()


def by_slug(slug: str) -> SourceDef | None:
    return next((d for d in CATALOGUE if d.slug == slug), None)
