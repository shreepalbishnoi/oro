"""Database lookups that feed the assay: SEBI register, surveillance, EOD volume spikes,
'Who's on the other side?' disclosures and Forward Trail."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Disclosure as DisclosureRow
from app.models import ForwardFingerprint, RegisteredIntermediary, SurveillanceFlag
from app.verify import trail as tr
from app.verify.types import Disclosure, Entity, Trail

SPIKE_MULTIPLE = 5.0
OTHER_SIDE_DAYS = 30


async def registry_lookup(session: AsyncSession, numbers: list[str]) -> tuple[dict[str, str], bool]:
    loaded = bool(
        await session.scalar(select(func.count()).select_from(RegisteredIntermediary).limit(1))
    )
    if not numbers:
        return {}, loaded
    rows = await session.execute(
        select(RegisteredIntermediary.reg_no, RegisteredIntermediary.name).where(
            RegisteredIntermediary.reg_no.in_(numbers)
        )
    )
    return {r[0]: r[1] for r in rows}, loaded


async def enrich_entities(session: AsyncSession, entities: list[Entity]) -> None:
    """Adds surveillance stage and a last-5-sessions volume spike (vs own 60-day average)."""
    ids = [e.instrument_id for e in entities if e.instrument_id]
    if not ids:
        return
    flags = await session.execute(
        select(SurveillanceFlag.instrument_id, SurveillanceFlag.list, SurveillanceFlag.stage).where(
            SurveillanceFlag.instrument_id.in_(ids)
        )
    )
    by_id: dict[int, str] = {}
    for iid, lst, stage in flags:
        by_id[iid] = f"{lst} {stage}".strip()

    spikes = await session.execute(
        text(
            """
            WITH recent AS (
              SELECT instrument_id, trade_date, volume,
                     AVG(volume) OVER (PARTITION BY instrument_id ORDER BY trade_date
                                       ROWS BETWEEN 60 PRECEDING AND 1 PRECEDING) AS avg60,
                     ROW_NUMBER() OVER (PARTITION BY instrument_id ORDER BY trade_date DESC) AS rn
              FROM prices_eod
              WHERE instrument_id = ANY(:ids) AND trade_date >= :since AND volume IS NOT NULL
            )
            SELECT DISTINCT ON (instrument_id) instrument_id, trade_date, volume / NULLIF(avg60, 0) AS mult
            FROM recent WHERE rn <= 5 AND avg60 > 0
            ORDER BY instrument_id, volume / NULLIF(avg60, 0) DESC NULLS LAST
            """
        ),
        {"ids": ids, "since": date.today() - timedelta(days=120)},
    )
    spike_by_id = {r.instrument_id: (r.trade_date, float(r.mult)) for r in spikes if r.mult}
    for e in entities:
        if e.instrument_id in by_id:
            e.surveillance = by_id[e.instrument_id]
        if (s := spike_by_id.get(e.instrument_id)) and s[1] >= SPIKE_MULTIPLE:
            e.spike = f"Volume {s[1]:.0f}× its 60-day average on {s[0]:%d %b}"


async def other_side(
    session: AsyncSession, entities: list[Entity], limit: int = 8
) -> list[Disclosure]:
    ids = [e.instrument_id for e in entities if e.instrument_id]
    if not ids:
        return []
    since = date.today() - timedelta(days=OTHER_SIDE_DAYS)
    rows = (
        await session.scalars(
            select(DisclosureRow)
            .where(DisclosureRow.instrument_id.in_(ids), DisclosureRow.deal_date >= since)
            .order_by(DisclosureRow.deal_date.desc())
            .limit(limit)
        )
    ).all()
    return [
        Disclosure(
            date=r.deal_date.isoformat(),
            kind=r.kind,
            party=r.party,
            detail=r.detail,
            source=r.source,
            url=r.url,
        )  # fmt: skip
        for r in rows
    ]


async def record_trail(
    session: AsyncSession, raw_text: str, channel: str, record: bool = True
) -> Trail | None:
    """Upserts this text's fingerprint into its variant cluster and returns the cluster trail.
    Text-free: only hashes are stored."""
    h = tr.simhash(raw_text)
    exact = tr.exact_hash(raw_text)
    now = datetime.now(UTC)

    existing = await session.scalar(
        select(ForwardFingerprint).where(ForwardFingerprint.exact_hash == exact)
    )
    cluster_id: int | None = existing.cluster_id if existing else None
    if cluster_id is None:
        nearest = (
            await session.execute(
                text(
                    "SELECT cluster_id, bit_count((simhash # :h)::bit(64)) AS d "
                    "FROM forward_fingerprints WHERE last_seen >= :since "
                    "ORDER BY d LIMIT 1"
                ),
                {"h": tr.to_signed(h), "since": now - timedelta(days=tr.WINDOW_DAYS)},
            )
        ).first()
        if nearest is not None and nearest.d <= tr.MAX_DISTANCE:
            cluster_id = nearest.cluster_id

    if record:
        stmt = insert(ForwardFingerprint).values(
            cluster_id=cluster_id or 0, exact_hash=exact, simhash=tr.to_signed(h),
            check_count=1, channels=[channel], first_seen=now, last_seen=now,
        )  # fmt: skip
        stmt = stmt.on_conflict_do_update(
            index_elements=[ForwardFingerprint.exact_hash],
            set_={
                "check_count": ForwardFingerprint.check_count + 1,
                "last_seen": now,
                # Append the channel only if it's new for this fingerprint.
                "channels": text(
                    "CASE WHEN :ch = ANY(forward_fingerprints.channels) "
                    "THEN forward_fingerprints.channels "
                    "ELSE array_append(forward_fingerprints.channels, :ch) END"
                ).bindparams(ch=channel),
            },
        ).returning(ForwardFingerprint.id, ForwardFingerprint.cluster_id)
        row = (await session.execute(stmt)).one()
        if row.cluster_id == 0:  # a new cluster is rooted at its first row
            await session.execute(
                ForwardFingerprint.__table__.update()
                .where(ForwardFingerprint.id == row.id)
                .values(cluster_id=row.id)
            )
            cluster_id = row.id
        else:
            cluster_id = row.cluster_id
        await session.flush()

    if cluster_id is None:
        return None
    agg = (
        await session.execute(
            select(
                func.sum(ForwardFingerprint.check_count),
                func.count(),
                func.min(ForwardFingerprint.first_seen),
            ).where(ForwardFingerprint.cluster_id == cluster_id)
        )
    ).one()
    count, variants, first = int(agg[0] or 0), int(agg[1] or 0), agg[2]
    if count < tr.PRIVACY_FLOOR:
        return None
    channels = (
        (
            await session.execute(
                text(
                    "SELECT DISTINCT unnest(channels) FROM forward_fingerprints WHERE cluster_id = :c"
                ),
                {"c": cluster_id},
            )
        )
        .scalars()
        .all()
    )
    return Trail(
        count=count,
        variants=variants,
        first_seen_days_ago=max(0, (now - first).days) if first else 0,
        channels=sorted(channels),
    )
