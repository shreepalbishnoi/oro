"""Karat (0–24) and risk band, exactly as published in PLAN §9.2 and /methodology.
Deterministic and versioned, so any verdict can be recomputed."""

import math

from app.verify.types import Claim, Judgment, KaratParts, Origin, RiskBand, Signal

KARAT_VERSION = "karat-0.1"

TIER_WEIGHT = {1: 1.0, 2: 1.0, 3: 0.7, 4: 0.4}


def _js_round(x: float) -> int:
    # Matches JS Math.round (half up); Python's round() is banker's rounding.
    return math.floor(x + 0.5)


def karat(
    claims: list[Claim], judgments: list[Judgment], signals: list[Signal], origin: Origin
) -> tuple[int, KaratParts]:
    base = 12
    ev = 0.0
    for j in judgments:
        w = TIER_WEIGHT[j.doc.tier] if j.doc else 1.0
        if j.label == "supported":
            ev += 3 * w
        elif j.label == "conflicting":
            ev -= 5 * w
    evidence = max(-9.0, min(9.0, ev))
    source = 3 if origin == "filing" else 0 if origin == "tier1_news" else -3

    lang = 0
    for c in claims:
        if c.hedging:
            lang -= 1
        if c.attribution != "named":
            lang -= 1
    language = max(-3, lang)

    scam = 0
    for s in signals:
        if s.severity == "medium":
            scam -= 2
        elif s.severity == "severe":
            scam -= 6

    k = max(0, min(24, _js_round(base + evidence + source + language + scam)))

    # 24 only when every checkable claim is Supported by a tier 1 or 2 source.
    by_claim = {j.claim_id: j for j in judgments}
    checkable = [c for c in claims if c.checkable]
    perfect = bool(checkable) and all(
        (j := by_claim.get(c.id)) is not None
        and j.label == "supported"
        and j.doc is not None
        and j.doc.tier <= 2
        for c in checkable
    )
    capped = k == 24 and not perfect
    if capped:
        k = 23
    parts = KaratParts(
        base=base,
        evidence=_js_round(evidence * 10) / 10,
        source=source,
        language=language,
        scam=scam,
        capped=capped,
    )
    return k, parts


HIGH_AT_MEDIUM = 3


def risk_band(claims: list[Claim], judgments: list[Judgment], signals: list[Signal]) -> RiskBand:
    """Bands describe the information, never the stock."""
    if any(s.severity == "severe" for s in signals):
        return "high"
    # Three different medium warnings together (say price call + hype + secrecy) is the shape of
    # a pump message even when no single line is conclusive.
    if len({s.id for s in signals if s.severity == "medium"}) >= HIGH_AT_MEDIUM:
        return "high"
    material = {c.id for c in claims if c.checkable}
    if any(j.label == "conflicting" and j.claim_id in material for j in judgments):
        return "high"
    if any(s.severity == "medium" for s in signals):
        return "elevated"
    unv = sum(1 for j in judgments if j.label == "unverified")
    if judgments and unv / len(judgments) > 0.5:
        return "elevated"
    return "low"
