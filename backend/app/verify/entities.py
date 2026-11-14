"""Entity linker (PLAN §M1): maps tip text to listed companies via the instrument master.

Exact n-gram match on `entity_aliases.alias_norm` (btree, index-backed) plus uppercase tickers
in the original text. Longest alias wins, so "tata motors" beats "tata". Results carry the flags
the scam rules need (SME, surveillance stage, volume spike)."""

import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingest.reference.normalize import normalize_name
from app.models import EntityAlias, Instrument
from app.verify.types import Entity

# Words that are also aliases of some company but mean nothing alone in a tip.
_STOP = {
    "india", "indian", "power", "bank", "finance", "capital", "energy", "steel", "infra",
    "global", "industries", "enterprises", "group", "share", "shares", "stock", "market",
    "target", "today", "order", "profit", "return", "returns", "buy", "sell", "news",
}  # fmt: skip
_TICKER = re.compile(r"\b[A-Z][A-Z0-9&-]{2,19}\b")
MAX_NGRAM = 5


@dataclass
class Linked:
    entity: Entity
    aliases: set[str] = field(default_factory=set)
    score: int = 0  # length of the longest matched alias


def ngrams(norm: str, n_max: int = MAX_NGRAM) -> set[str]:
    words = norm.split()
    out: set[str] = set()
    for n in range(1, n_max + 1):
        for i in range(len(words) - n + 1):
            g = " ".join(words[i : i + n])
            if len(g) >= 3 and g not in _STOP:
                out.add(g)
    return out


async def link_entities(
    session: AsyncSession, text: str, limit: int = 6
) -> tuple[list[Entity], dict[str, set[str]]]:
    """Returns entities (best first) and, per symbol, the alias forms that matched."""
    norm = normalize_name(text)
    grams = ngrams(norm)
    tickers = {t for t in _TICKER.findall(text) if t not in {"SEBI", "NSE", "BSE", "RBI", "UPI"}}
    if not grams and not tickers:
        return [], {}

    rows = []
    if grams:
        stmt = (
            select(EntityAlias.alias_norm, Instrument)
            .join(Instrument, Instrument.id == EntityAlias.instrument_id)
            .where(
                EntityAlias.alias_norm.in_(list(grams)[:400]),
                Instrument.active.is_(True),
                Instrument.kind == "equity",
            )
        )
        rows = list((await session.execute(stmt)).all())
    if tickers:
        stmt2 = select(Instrument).where(
            Instrument.nse_symbol.in_(list(tickers)), Instrument.active.is_(True)
        )
        for inst in (await session.scalars(stmt2)).all():
            rows.append((inst.nse_symbol.lower(), inst))

    found: dict[int, Linked] = {}
    for alias_norm, inst in rows:
        # A single short word must be a ticker typed in capitals to count.
        if " " not in alias_norm and len(alias_norm) < 5 and alias_norm.upper() not in tickers:
            continue
        sym = inst.nse_symbol or inst.bse_code or str(inst.id)
        linked = found.get(inst.id)
        if linked is None:
            linked = Linked(entity=_to_entity(inst, sym))
            found[inst.id] = linked
        linked.aliases.add(alias_norm)
        linked.score = max(linked.score, len(alias_norm))

    # Drop entities whose every alias is contained in a longer matched alias of another entity
    # ("tata" inside "tata motors").
    ranked = sorted(found.values(), key=lambda x: -x.score)
    kept: list[Linked] = []
    for cand in ranked:
        longest = max(cand.aliases, key=len)
        if any(longest != a and longest in a for k in kept for a in k.aliases):
            continue
        kept.append(cand)
    kept = kept[:limit]
    return [k.entity for k in kept], {k.entity.symbol: k.aliases for k in kept}


def _to_entity(inst: Instrument, symbol: str) -> Entity:
    exchange = "NSE" if inst.nse_symbol else "BSE"
    if inst.is_sme:
        exchange += " SME"
    return Entity(
        symbol=symbol,
        name=inst.name,
        exchange=exchange,
        sector=inst.industry or "",
        sme=inst.is_sme or None,
        instrument_id=inst.id,
    )


def entity_in(sentence: str, entities: list[Entity], aliases: dict[str, set[str]]) -> Entity | None:
    n = f" {normalize_name(sentence)} "
    up = sentence.upper()
    for e in entities:
        if any(f" {a} " in n for a in aliases.get(e.symbol, ())):
            return e
        if re.search(rf"\b{re.escape(e.symbol)}\b", up):
            return e
    return None
