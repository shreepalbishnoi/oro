"""The Parakh assay (PLAN §6.2). Streams stage events with the same shapes as the web app's
rules preview (apps/web/src/lib/engine/types.ts AssayEvent), so the UI needs no changes.

Order: scrub → entities + rule signals (no LLM, streamed within ~1 s) → claims (LLM or rules)
→ evidence + judgments → trail, other side → Karat → done. Every user-visible sentence ORO
writes goes through the advice filter."""

import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.router import LlmRouter
from app.retrieval.hybrid import claim_type_of, search
from app.verify import context as ctx
from app.verify.advice import guard
from app.verify.entities import link_entities
from app.verify.extract import extract_claims
from app.verify.judge import ClaimEvidence, judge_all
from app.verify.karat import KARAT_VERSION, karat, risk_band
from app.verify.scrub import scrub
from app.verify.signals import detect_signals, host_of, registration_numbers
from app.verify.types import (
    Claim,
    InputInfo,
    InputKind,
    Judgment,
    Origin,
    Signal,
    Verdict,
)

MAX_INPUT = 4000

_FILING_HOSTS = re.compile(r"(nseindia\.com|bseindia\.com|sebi\.gov\.in)$")
_TIER1_HOSTS = re.compile(
    r"(economictimes\.indiatimes\.com|livemint\.com|business-standard\.com|thehindubusinessline\.com|moneycontrol\.com|reuters\.com)$"
)


def origin_of(text: str) -> Origin:
    hosts = [host_of(m.group(0)) or "" for m in re.finditer(r"\bhttps?://\S+", text, re.I)]
    if any(_FILING_HOSTS.search(h) for h in hosts) or re.search(
        r"\b(as per|according to) (its|the) (nse|bse) filing\b", text, re.I
    ):
        return "filing"
    if any(_TIER1_HOSTS.search(h) for h in hosts):
        return "tier1_news"
    return "unknown"


def summarise(
    signals: list[Signal], judgments: list[Judgment], claims: list[Claim], risk: str
) -> str:
    parts: list[str] = []
    severe = [s for s in signals if s.severity == "severe"]
    conflict = next((j for j in judgments if j.label == "conflicting"), None)
    supported = sum(1 for j in judgments if j.label == "supported")
    parts.append(
        {"high": "High risk.", "elevated": "Be careful."}.get(risk, "Low risk information.")
    )
    if severe:
        parts.append(f"{severe[0].title}.")
    if conflict:
        parts.append(conflict.reason)
    if supported:
        parts.append(
            f"{supported} claim{'s' if supported > 1 else ''} match{'' if supported > 1 else 'es'} exchange records."
        )
    if not conflict and not supported and any(c.checkable for c in claims):
        parts.append("No record confirms the main claim yet.")
    return guard(" ".join(parts))


@dataclass
class AssayInput:
    raw: str
    kind: InputKind = "text"
    channel: str = "web"
    record_trail: bool = True
    ref: str = ""


def ev(type_: str, **data: object) -> dict:
    return {"type": type_, **data}


async def run_assay(
    session: AsyncSession, router: LlmRouter | None, inp: AssayInput
) -> AsyncIterator[dict]:
    """Yields AssayEvent dicts. The last event is {"type": "verdict", "verdict": Verdict}
    (internal; the API turns it into the public "done" event once the check is saved)."""
    raw = inp.raw[:MAX_INPUT]

    yield ev("stage", stage="scrub")
    redacted, removed = scrub(raw)
    yield ev("scrubbed", redacted=redacted, piiRemoved=removed)

    # Rule signals first: the user sees value before any LLM call returns.
    yield ev("stage", stage="signals")
    entities, aliases = await link_entities(session, raw)
    await ctx.enrich_entities(session, entities)
    registry, loaded = await ctx.registry_lookup(session, registration_numbers(raw))
    signals = detect_signals(raw, entities, registry, registry_loaded=loaded)
    for s in signals:
        yield ev("signal", signal=s.dump())

    yield ev("stage", stage="claims")
    claims, llm_extract = await extract_claims(
        session, router, redacted, entities, aliases, inp.ref
    )
    yield ev("claims", claims=[c.dump() for c in claims])

    yield ev("stage", stage="evidence")
    evidence: list[ClaimEvidence] = []
    for c in claims:
        hits = []
        if c.kind in ("corporate_event", "other") and c.checkable:
            hits = await search(
                session,
                c.text if not c.subject else f"{c.subject.name} {c.text}",
                instrument_id=c.subject.instrument_id if c.subject else None,
                claim_type=claim_type_of(c.text),
            )
        evidence.append(ClaimEvidence(claim=c, hits=hits))
    judgments, llm_judge = await judge_all(router, evidence, inp.ref)
    for j in judgments:
        yield ev("judgment", judgment=j.dump())

    trail = await ctx.record_trail(session, raw, inp.channel, record=inp.record_trail)
    yield ev("trail", trail=trail.dump() if trail else None)
    other = await ctx.other_side(session, entities)
    if other:
        yield ev("otherSide", items=[d.dump() for d in other])

    yield ev("stage", stage="karat")
    k, parts = karat(claims, judgments, signals, origin_of(raw))
    risk = risk_band(claims, judgments, signals)
    yield ev("karat", karat=k, parts=parts.dump(), risk=risk)

    verdict = Verdict(
        version=KARAT_VERSION,
        input=InputInfo(kind=inp.kind, redacted=redacted, pii_removed=removed),
        signals=signals,
        claims=claims,
        judgments=judgments,
        karat=k,
        karat_parts=parts,
        risk=risk,
        trail=trail,
        other_side=other,
        entities=entities,
        summary=summarise(signals, judgments, claims, risk),
        mode="assay" if (llm_extract or llm_judge) else "records-only",
    )
    yield ev("stage", stage="done")
    yield {"type": "verdict", "verdict": verdict}


async def assay_once(session: AsyncSession, router: LlmRouter | None, inp: AssayInput) -> Verdict:
    """Non-streaming convenience (Telegram bot, tests)."""
    verdict: Verdict | None = None
    async for e in run_assay(session, router, inp):
        if e["type"] == "verdict":
            verdict = e["verdict"]
    assert verdict is not None
    return verdict
