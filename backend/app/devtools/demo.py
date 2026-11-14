"""Fictional demo data (same companies and records as apps/web/src/lib/fixtures). Every company
here is invented, so no red flag is ever attached to a real business.

    python -m app.devtools.demo        # seed the configured database
"""

import asyncio
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingest.reference.normalize import normalize_name
from app.models import (
    Disclosure,
    EntityAlias,
    Instrument,
    RegisteredIntermediary,
    Source,
    SurveillanceFlag,
)
from app.pipeline.store import RawItem, process_document, store_item

COMPANIES = [
    # symbol, name, sector, group, sme, aliases
    ("KAVERIPWR", "Kaveri Power Systems", "Capital goods", "Kaveri Group", False, ["kaveri power", "kaveri", "कावेरी"]),
    ("MERIDPORT", "Meridian Ports & Logistics", "Ports & logistics", "Meridian Group", False, ["meridian ports", "meridian port", "meridian"]),
    ("SURYAFIN", "Surya Fincap", "NBFC", None, True, ["surya fincap", "surya finance", "surya"]),
    ("NIRMALBIO", "Nirmal Biotech", "Pharma", None, True, ["nirmal biotech", "nirmal bio", "nirmal"]),
    ("TARANGTEL", "Tarang Telecom", "Telecom", "Meridian Group", False, ["tarang telecom", "tarang"]),
    ("HIMGIRI", "Himgiri Cements", "Cement", "Kaveri Group", False, ["himgiri cements", "himgiri cement", "himgiri"]),
]  # fmt: skip

DEMO_ISIN_PREFIX = "INE9Z9"  # 'Z9' never appears in real ISINs issued to listed equities


def _d(s: str) -> datetime:
    return datetime.fromisoformat(f"{s}T10:00:00+05:30")


EVIDENCE = [
    ("KAVERIPWR", 1, "NSE filing", "Kaveri Power Systems: receipt of order (Reg 30)",
     "The Company has received a Letter of Award from a state transmission utility for a 400 kV substation package valued at Rs 420 crore, to be executed over 24 months.", "2026-11-07"),
    ("KAVERIPWR", 1, "NSE filing", "Kaveri Power Systems: Q2 FY27 results",
     "Revenue from operations for the quarter was Rs 1,184 crore against Rs 1,020 crore in the corresponding quarter last year. Net profit was Rs 96 crore.", "2026-10-30"),
    ("SURYAFIN", 1, "NSE filing", "Surya Fincap: clarification on news item (Reg 30(11))",
     "With reference to the news item regarding a proposed merger with a foreign bank, the Company clarifies that it is not in any discussion regarding such a proposal and there is no such information that requires disclosure.", "2026-11-06"),
    ("MERIDPORT", 1, "NSE filing", "Meridian Ports & Logistics: interim dividend",
     "The Board has declared an interim dividend of Rs 7 per equity share of face value Rs 2 each. The record date is 20 November 2026.", "2026-11-04"),
    ("MERIDPORT", 1, "NSE filing", "Meridian Ports & Logistics: acquisition of a terminal operator",
     "The Company has entered into a share purchase agreement to acquire 100% of Coastline Terminals Private Limited for a consideration of Rs 1,350 crore.", "2026-11-01"),
    ("NIRMALBIO", 1, "BSE filing", "Nirmal Biotech: creation of pledge by promoter (SAST)",
     "Promoter entity Nirmal Holdings has created a pledge on 31.2% of the total share capital of the Company, up from 12.0% previously.", "2026-11-05"),
    ("TARANGTEL", 1, "NSE filing", "Tarang Telecom: Q2 FY27 results",
     "Net loss for the quarter was Rs 212 crore compared with a net loss of Rs 305 crore in the corresponding quarter last year.", "2026-11-03"),
    ("HIMGIRI", 1, "NSE filing", "Himgiri Cements: outcome of board meeting, bonus issue",
     "The Board has recommended a bonus issue of equity shares in the ratio of 1:1, subject to shareholder approval.", "2026-11-08"),
]  # fmt: skip

SAMPLE_TIPS = {
    "kaveri": (
        "Forwarded many times\n🚀🚀 KAVERI POWER ko ₹4,200 crore ka order mila hai, kal announcement hoga!\n"
        "Operator news hai, kisi ko mat batana. Target 180, SL 120.\n"
        "VIP group join karo sirf ₹999 mein: pay to profitking@ybl\n100% sure shot, aaj hi lo 🔥"
    ),
    "surya": (
        "BIG NEWS: Surya Fincap merging with a foreign bank, sources say deal is done. Stock can give "
        "300% returns in 2 months. SEBI registered advisor. Only today entry. Join https://t.me/+SuryaVIPcalls"
    ),
    "meridian": (
        "Meridian Ports & Logistics announced an interim dividend of Rs 7 per share, record date 20 "
        "November, as per its NSE filing. It also filed to acquire Coastline Terminals for Rs 1,350 crore."
    ),
    "app": (
        "Zerodha new VIP app launched for premium clients 🎁 Guaranteed 5% daily profit. Download now: "
        "https://zerodha-premium.in/app.apk SEBI approved scheme. Limited seats."
    ),
}


async def seed(session: AsyncSession) -> dict[str, int]:
    ids: dict[str, int] = {}
    for i, (sym, name, sector, group, sme, aliases) in enumerate(COMPANIES):
        stmt = (
            insert(Instrument)
            .values(
                kind="equity",
                isin=f"{DEMO_ISIN_PREFIX}{i:05d}",
                name=name,
                nse_symbol=sym,
                industry=sector,
                group_name=group,
                is_sme=sme,
                series="SM" if sme else "EQ",
            )  # fmt: skip
            .on_conflict_do_update(index_elements=[Instrument.nse_symbol], set_={"name": name})
            .returning(Instrument.id)
        )
        iid = (await session.execute(stmt)).scalar_one()
        ids[sym] = iid
        for alias in {name, sym, *aliases}:
            await session.execute(
                insert(EntityAlias)
                .values(
                    instrument_id=iid,
                    alias=alias,
                    alias_norm=normalize_name(alias),
                    source="manual",
                )
                .on_conflict_do_nothing()
            )

    src_ids: dict[str, int] = {}
    for slug, name in (("demo-nse", "NSE filing"), ("demo-bse", "BSE filing")):
        stmt = (
            insert(Source)
            .values(
                slug=slug,
                name=name,
                tier=1,
                kind="demo",
                url="https://example.invalid",
                enabled=False,
            )
            .on_conflict_do_update(index_elements=[Source.slug], set_={"name": name})
            .returning(Source.id)
        )
        src_ids[name] = (await session.execute(stmt)).scalar_one()

    for sym, tier, src, title, body, day in EVIDENCE:
        doc_id = await store_item(
            session,
            src_ids[src],
            tier,
            RawItem(
                url="https://www.nseindia.com/companies-listing/corporate-filings-announcements",
                title=title,
                body=body,
                published_at=_d(day),
                symbol_hint=sym,
            ),  # fmt: skip
        )
        if doc_id:
            await process_document(session, doc_id)

    await session.execute(
        insert(SurveillanceFlag)
        .values(
            instrument_id=ids["SURYAFIN"], list="ASM", stage="Stage II", as_of=date(2026, 11, 2)
        )
        .on_conflict_do_nothing()
    )
    for reg, name in (
        ("INH000017001", "Tattva Research Pvt Ltd"),
        ("INH000017002", "Anvay Equity Research"),
    ):
        await session.execute(
            insert(RegisteredIntermediary)
            .values(
                kind="RA",
                reg_no=reg,
                name=name,
                name_norm=normalize_name(name),
                as_of=date(2026, 11, 1),
            )
            .on_conflict_do_nothing()
        )
    today = date.today()
    for sym, days, kind, party, side, qty, detail in (
        ("SURYAFIN", 5, "Bulk deal", "Ridgeline Trading LLP", "SELL", 480000, "Sold 4,80,000 shares"),
        ("SURYAFIN", 6, "Bulk deal", "Ridgeline Trading LLP", "BUY", 510000, "Bought 5,10,000 shares"),
        ("NIRMALBIO", 6, "Pledge created", "Nirmal Holdings (promoter)", None, None, "Pledge now 31.2% of equity, from 12.0%"),
    ):  # fmt: skip
        await session.execute(
            insert(Disclosure)
            .values(
                instrument_id=ids[sym],
                symbol=sym,
                kind=kind,
                party=party,
                side=side,
                quantity=qty,
                detail=detail,
                deal_date=today - timedelta(days=days),
                source="NSE bulk deals (demo)",
                url="https://www.nseindia.com/report-detail/display-bulk-and-block-deals",
                dedupe_key=f"demo:{sym}:{days}:{kind}",
            )  # fmt: skip
            .on_conflict_do_nothing()
        )
    await session.commit()
    return ids


async def _main() -> None:
    from app.db.session import dispose_engine, get_sessionmaker

    async with get_sessionmaker()() as session:
        ids = await seed(session)
        n = await session.scalar(select(Instrument.id).where(Instrument.nse_symbol == "KAVERIPWR"))
    print(f"seeded {len(ids)} fictional companies (Kaveri id {n}) at {datetime.now(UTC):%H:%M:%S}")
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(_main())
