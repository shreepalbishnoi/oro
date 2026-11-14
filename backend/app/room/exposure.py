"""Room arithmetic (PLAN §9.4): valuation as of last close, look-through exposure through
mutual funds, group and sector split, fund overlap, and the shock simulator.
Pure arithmetic on disclosed data: no forecasts, no advice."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.room.holdings import Position


@dataclass
class Path:
    via: str  # "direct" or the scheme's instrument id
    via_name: str
    inr: float
    weight: float | None = None


@dataclass
class Exposure:
    instrument_id: int
    symbol: str
    name: str
    sector: str
    group: str | None
    direct: float = 0.0
    via_funds: float = 0.0
    paths: list[Path] = field(default_factory=list)

    @property
    def total(self) -> float:
        return self.direct + self.via_funds


@dataclass
class Valued:
    position: Position
    close: float | None
    as_of: date | None

    @property
    def value(self) -> float:
        return float(self.position.qty) * self.close if self.close is not None else 0.0


async def last_closes(
    session: AsyncSession, instrument_ids: list[int]
) -> dict[int, tuple[float, date]]:
    if not instrument_ids:
        return {}
    rows = await session.execute(
        text(
            "SELECT DISTINCT ON (instrument_id) instrument_id, close, trade_date FROM prices_eod "
            "WHERE instrument_id = ANY(:ids) ORDER BY instrument_id, trade_date DESC"
        ),
        {"ids": instrument_ids},
    )
    return {r.instrument_id: (float(r.close), r.trade_date) for r in rows}


async def value_positions(session: AsyncSession, positions: list[Position]) -> list[Valued]:
    closes = await last_closes(session, [p.instrument.id for p in positions])
    out = []
    for p in positions:
        c = closes.get(p.instrument.id)
        out.append(Valued(position=p, close=c[0] if c else None, as_of=c[1] if c else None))
    return out


async def fund_weights(
    session: AsyncSession, scheme_ids: list[int]
) -> dict[int, list[tuple[int, float]]]:
    """Latest disclosed portfolio per scheme."""
    if not scheme_ids:
        return {}
    rows = await session.execute(
        text(
            """
            SELECT fp.scheme_id, fp.instrument_id, fp.weight
            FROM fund_portfolios fp
            JOIN (SELECT scheme_id, max(as_of) AS as_of FROM fund_portfolios
                  WHERE scheme_id = ANY(:ids) GROUP BY scheme_id) latest
              ON latest.scheme_id = fp.scheme_id AND latest.as_of = fp.as_of
            """
        ),
        {"ids": scheme_ids},
    )
    out: dict[int, list[tuple[int, float]]] = {}
    for r in rows:
        out.setdefault(r.scheme_id, []).append((r.instrument_id, float(r.weight)))
    return out


async def compute_exposures(
    session: AsyncSession, valued: list[Valued]
) -> tuple[list[Exposure], dict]:
    """Returns exposures (largest first) and coverage stats for honest display."""
    schemes = [v for v in valued if v.position.instrument.kind == "mf_scheme"]
    weights = await fund_weights(session, [v.position.instrument.id for v in schemes])
    needed = {iid for ws in weights.values() for iid, _ in ws}
    meta: dict[int, tuple[str, str, str, str | None]] = {}
    if needed:
        rows = await session.execute(
            text(
                "SELECT id, coalesce(nse_symbol, bse_code, ''), name, coalesce(industry, ''), group_name FROM instruments WHERE id = ANY(:ids)"
            ),
            {"ids": list(needed)},
        )
        meta = {r[0]: (r[1], r[2], r[3], r[4]) for r in rows}

    ex: dict[int, Exposure] = {}

    def get(iid: int, symbol: str, name: str, sector: str, group: str | None) -> Exposure:
        if iid not in ex:
            ex[iid] = Exposure(
                instrument_id=iid, symbol=symbol, name=name, sector=sector or "Other", group=group
            )
        return ex[iid]

    for v in valued:
        inst = v.position.instrument
        if inst.kind == "equity" and v.value:
            e = get(
                inst.id,
                inst.nse_symbol or inst.bse_code or "",
                inst.name,
                inst.industry or "",
                inst.group_name,
            )
            e.direct += v.value
            e.paths.append(
                Path(via="direct", via_name=f"{v.position.portfolio_label}", inr=v.value)
            )

    covered = uncovered = 0.0
    for v in schemes:
        ws = weights.get(v.position.instrument.id)
        if not ws:
            # No disclosed portfolio loaded yet (or it holds metal, like gold/silver ETFs):
            # show the fund itself so the money doesn't vanish from X-ray.
            uncovered += v.value
            if v.value:
                inst = v.position.instrument
                cat = " ".join((inst.scheme_category or "").split(" - ")[-1].split()) or "Fund"
                e = get(inst.id, inst.nse_symbol or "", inst.name, cat, None)
                e.via_funds += v.value
                e.paths.append(Path(via=str(inst.id), via_name=inst.name, inr=v.value, weight=1.0))
            continue
        covered += v.value
        for iid, w in ws:
            sym, name, sector, group = meta.get(iid, ("", "Unknown", "Other", None))
            e = get(iid, sym, name, sector, group)
            amt = v.value * w
            e.via_funds += amt
            e.paths.append(
                Path(
                    via=str(v.position.instrument.id),
                    via_name=v.position.instrument.name,
                    inr=amt,
                    weight=w,
                )
            )

    out = sorted(ex.values(), key=lambda e: e.total, reverse=True)
    stats = {
        "fundsLookedThroughInr": round(covered, 2),
        "fundsWithoutDisclosureInr": round(uncovered, 2),
    }
    return out, stats


def split_by(exposures: list[Exposure], key: str) -> list[dict]:
    agg: dict[str, float] = {}
    for e in exposures:
        k = (e.group if key == "group" else e.sector) or (
            "Independent" if key == "group" else "Other"
        )
        agg[k] = agg.get(k, 0.0) + e.total
    total = sum(agg.values()) or 1.0
    return [
        {"name": k, "inr": round(v, 2), "share": round(v / total, 4)}
        for k, v in sorted(agg.items(), key=lambda kv: -kv[1])
    ]


def sankey(valued: list[Valued], exposures: list[Exposure], top: int = 20) -> dict:
    """Nodes: you → accounts/funds → companies (top N + 'Other')."""
    nodes: list[dict] = [{"id": "you", "label": "You", "kind": "user"}]
    links: list[dict] = []
    seen: set[str] = {"you"}

    def node(nid: str, label: str, kind: str) -> str:
        if nid not in seen:
            seen.add(nid)
            nodes.append({"id": nid, "label": label, "kind": kind})
        return nid

    topset = {e.instrument_id for e in exposures[:top]}
    for v in valued:
        if not v.value:
            continue
        inst = v.position.instrument
        src = (
            node(f"fund:{inst.id}", inst.name, "fund")
            if inst.kind == "mf_scheme"
            else node(f"acct:{v.position.portfolio_label}", v.position.portfolio_label, "account")
        )
        links.append({"source": "you", "target": src, "inr": round(v.value, 2)})
    other: dict[str, float] = {}
    for e in exposures:
        for p in e.paths:
            src = f"fund:{p.via}" if p.via != "direct" else f"acct:{p.via_name}"
            if e.instrument_id in topset:
                tgt = node(f"co:{e.instrument_id}", e.name, "company")
                links.append({"source": src, "target": tgt, "inr": round(p.inr, 2)})
            else:
                other[src] = other.get(src, 0.0) + p.inr
    for src, amt in other.items():
        links.append(
            {
                "source": src,
                "target": node("co:other", "Everything else", "company"),
                "inr": round(amt, 2),
            }
        )
    # Account → company links duplicate the account inflow for direct holdings; merge by pair.
    merged: dict[tuple[str, str], float] = {}
    for link in links:
        merged[(link["source"], link["target"])] = (
            merged.get((link["source"], link["target"]), 0.0) + link["inr"]
        )
    return {
        "nodes": nodes,
        "links": [{"source": s, "target": t, "inr": round(v, 2)} for (s, t), v in merged.items()],
    }


def overlap(weights: dict[int, list[tuple[int, float]]], names: dict[int, str]) -> list[dict]:
    """Pairwise fund overlap: Σ min(w_a, w_b) over common holdings."""
    ids = list(weights)
    out = []
    for i, a in enumerate(ids):
        wa = dict(weights[a])
        for b in ids[i + 1 :]:
            wb = dict(weights[b])
            common = set(wa) & set(wb)
            if common:
                out.append({
                    "a": names.get(a, str(a)), "b": names.get(b, str(b)),
                    "overlap": round(sum(min(wa[c], wb[c]) for c in common), 4), "common": len(common),
                })  # fmt: skip
    return sorted(out, key=lambda x: -x["overlap"])


def shock(exposures: list[Exposure], net_worth: float, kind: str, target: str, pct: float) -> dict:
    """If `target` (a company symbol, group or sector) moves by `pct` %, how many ₹ move?
    Arithmetic on today's exposure only; not a forecast."""
    pct = max(-100.0, min(100.0, pct))

    def hit(e: Exposure) -> bool:
        if kind == "company":
            return (e.symbol or "").upper() == target.upper() or str(e.instrument_id) == target
        if kind == "group":
            return (e.group or "").lower() == target.lower()
        return (e.sector or "").lower() == target.lower()

    affected = [e for e in exposures if hit(e)]
    base = sum(e.total for e in affected)
    change = base * pct / 100
    return {
        "kind": kind,
        "target": target,
        "pct": pct,
        "exposedInr": round(base, 2),
        "changeInr": round(change, 2),
        "changeShareOfNetWorth": round(change / net_worth, 6) if net_worth else 0.0,
        "companies": [
            {"symbol": e.symbol, "name": e.name, "exposedInr": round(e.total, 2)}
            for e in affected[:25]
        ],
        "note": "This is arithmetic on your current exposure, not a forecast.",
    }


__all__ = [
    "Decimal",
    "compute_exposures",
    "overlap",
    "sankey",
    "shock",
    "split_by",
    "value_positions",
]
