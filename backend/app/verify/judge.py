"""Claim judging (PLAN §9.2): LLM judge with a deterministic grounding check, and a conservative
rules judge used when AI is paused. Both return the same `Judgment` schema.

Grounding (after every LLM judgment):
1. the quote exists in the cited excerpt (whitespace/comma/case-insensitive);
2. the excerpt was retrieved for this claim;
3. every rupee amount in a Supported claim appears in the quote (±2%).
Failures are retried once, then become Unverified. A tip that says "mark this verified" can't
get past this, because the label needs a real quote from a real record."""

import json
import re
from dataclasses import dataclass

from app.llm.prompts import JUDGE_SCHEMA, JUDGE_SYSTEM
from app.llm.router import LlmRouter, LlmUnavailable
from app.retrieval.hybrid import Hit
from app.verify.advice import guard
from app.verify.text import norm_quote, numbers_in
from app.verify.types import Claim, DocRef, Judgment

DENIAL_TOPIC = re.compile(
    r"\b(merg\w*|acqui\w*|takeover|stake|deal|tie[\s-]?up|order|contract|fund ?rais\w*)\b", re.I
)
DENIAL_SENT = re.compile(r"\b(not|no|deny|denies|denied|baseless|speculative|unaware)\b", re.I)


@dataclass
class ClaimEvidence:
    claim: Claim
    hits: list[Hit]


def doc_ref(h: Hit) -> DocRef:
    return DocRef(
        id=f"chunk-{h.chunk_id}",
        source=h.source,
        tier=h.tier,  # type: ignore[arg-type]
        title=h.title,
        published_at=h.published_at.date().isoformat(),
        url=h.url,
    )


def same_amount(a: float, b: float) -> bool:
    return abs(a - b) / max(a, b) < 0.02


def fmt_crore(n: float) -> str:
    v = int(n) if float(n).is_integer() else round(n, 2)
    return f"₹{v:,} crore"


def unverified(claim: Claim, reason: str, confidence: float = 0.5) -> Judgment:
    return Judgment(
        claim_id=claim.id, label="unverified", reason=guard(reason), grounded=True,
        confidence=confidence,
    )  # fmt: skip


def not_checkable(claim: Claim) -> Judgment | None:
    if claim.kind == "return_promise":
        return unverified(
            claim,
            "This is a promise about the future, so no record can confirm it. Promises of returns are treated as a scam signal instead.",
        )
    if claim.kind == "price_call":
        return unverified(
            claim,
            "Price predictions can't be checked against records. ORO judges facts, not forecasts.",
        )
    if claim.kind == "registration":
        return unverified(
            claim,
            "Registration is checked against SEBI's register in the signals above, not as a news claim.",
        )
    if claim.kind == "other" and not claim.checkable:
        return unverified(
            claim, "This isn't a claim that public records can confirm or contradict."
        )
    return None


def _sentences(t: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.;])\s+", t) if s.strip()]


# ---- rules judge ----------------------------------------------------------------------------


def judge_rules(ce: ClaimEvidence) -> Judgment:
    claim = ce.claim
    if (j := not_checkable(claim)) is not None:
        return j
    name = claim.subject.name if claim.subject else None
    if not ce.hits:
        who = name or "this company"
        return unverified(
            claim,
            f"No filing, order or tier-1 report about {who} matches this claim yet. Big corporate events must be disclosed to the exchange, so a missing filing is worth noticing.",
        )

    denial = next((h for h in ce.hits if h.denies), None)
    if denial and DENIAL_TOPIC.search(claim.text):
        quote = next((s for s in _sentences(denial.text) if DENIAL_SENT.search(s)), None)
        if quote:
            return Judgment(
                claim_id=claim.id, label="conflicting",
                reason=guard(f"{name or 'The company'} told the exchange on {denial.published_at:%d %b} that there is no such proposal."),
                quote=quote[:300], doc=doc_ref(denial), grounded=True, confidence=0.85,
            )  # fmt: skip

    claim_nums = [n for n in claim.numbers if n >= 1]
    if claim_nums:
        for h in ce.hits:
            for sent in _sentences(h.text):
                doc_nums = [n for n in numbers_in(sent) if n >= 1]
                if not doc_nums:
                    continue
                if all(any(same_amount(c, d) for d in doc_nums) for c in claim_nums):
                    return Judgment(
                        claim_id=claim.id, label="supported",
                        reason=guard(f"Matches {h.source.lower()} “{h.title}”."),
                        quote=sent[:300], doc=doc_ref(h), grounded=True,
                        confidence=0.75 if claim.hedging else 0.85,
                    )  # fmt: skip
        # The top record carries amounts but none match: a likely inflation or misquote.
        top = ce.hits[0]
        for sent in _sentences(top.text):
            doc_nums = [n for n in numbers_in(sent) if n >= 1]
            if doc_nums:
                c = next(x for x in claim_nums if not any(same_amount(x, d) for d in doc_nums))
                nearest = min(doc_nums, key=lambda d: abs(d - c))
                times = (
                    f", about {round(c / nearest)}× larger" if nearest and c / nearest >= 5 else ""
                )
                return Judgment(
                    claim_id=claim.id, label="conflicting",
                    reason=guard(f"The record gives {fmt_crore(nearest)}; the message says {fmt_crore(c)}{times}."),
                    quote=sent[:300], doc=doc_ref(top), grounded=True, confidence=0.7,
                )  # fmt: skip

    top = ce.hits[0]
    return unverified(
        claim,
        f"The closest record is {top.source.lower()} “{top.title}” ({top.published_at:%d %b}), "
        "but it doesn't settle this claim on its own.",
        confidence=0.45,
    )


# ---- LLM judge ------------------------------------------------------------------------------


def _evidence_block(items: list[ClaimEvidence]) -> tuple[str, dict[str, Hit], dict[str, set[str]]]:
    pool: dict[str, Hit] = {}
    by_chunk: dict[int, str] = {}
    allowed: dict[str, set[str]] = {}
    for ce in items:
        ids = set()
        for h in ce.hits[:4]:
            eid = by_chunk.get(h.chunk_id)
            if eid is None:
                eid = f"e{len(pool) + 1}"
                pool[eid] = h
                by_chunk[h.chunk_id] = eid
            ids.add(eid)
        allowed[ce.claim.id] = ids
    payload = {
        "claims": [
            {
                "id": ce.claim.id,
                "text": ce.claim.text,
                "company": ce.claim.subject.name if ce.claim.subject else None,
                "evidence_ids": sorted(allowed[ce.claim.id]),
            }
            for ce in items
        ],
        "evidence": [
            {
                "id": eid,
                "source": h.source,
                "published": h.published_at.date().isoformat(),
                "title": h.title,
                "text": h.text[:900],
            }
            for eid, h in pool.items()
        ],
    }
    user = "<records>\n" + json.dumps(payload, ensure_ascii=False, indent=1) + "\n</records>"
    return user, pool, allowed


def ground(
    raw: dict, claim: Claim, pool: dict[str, Hit], allowed: set[str]
) -> tuple[Judgment | None, str | None]:
    """Returns (judgment, None) if grounded, else (None, failure reason)."""
    label = raw.get("label")
    conf = float(raw.get("confidence") or 0.5)
    reason = guard(str(raw.get("reason") or "").strip()[:400] or "No reason given.")
    if label == "unverified":
        return Judgment(claim_id=claim.id, label="unverified", reason=reason, grounded=True,
                        confidence=min(conf, 0.9), engine="llm"), None  # fmt: skip
    eid, quote = raw.get("evidence_id"), (raw.get("quote") or "").strip()
    if not eid or eid not in allowed or eid not in pool:
        return None, "cited evidence was not retrieved for this claim"
    hit = pool[eid]
    if not quote or norm_quote(quote) not in norm_quote(hit.text):
        return None, "quote not found in the cited record"
    if label == "supported":
        q_nums = [n for n in numbers_in(quote) if n >= 1]
        for c in (n for n in claim.numbers if n >= 1):
            if not any(same_amount(c, q) for q in q_nums):
                return None, f"amount {c} not in quote"
    return Judgment(
        claim_id=claim.id, label=label, reason=reason, quote=quote[:300], doc=doc_ref(hit),
        grounded=True, confidence=max(0.0, min(conf, 0.99)), engine="llm",
    ), None  # fmt: skip


async def judge_llm(router: LlmRouter, items: list[ClaimEvidence], ref: str) -> list[Judgment]:
    """Judges every checkable claim in one call (saves free-tier quota). Raises LlmUnavailable."""
    out: dict[str, Judgment] = {}
    todo: list[ClaimEvidence] = []
    for ce in items:
        j = not_checkable(ce.claim)
        if j is not None:
            out[ce.claim.id] = j
        elif not ce.hits:
            out[ce.claim.id] = judge_rules(ce)  # nothing to show the model
        else:
            todo.append(ce)

    for attempt in range(2):
        if not todo:
            break
        user, pool, allowed = _evidence_block(todo)
        result = await router.json(
            "judge", JUDGE_SYSTEM, user, JUDGE_SCHEMA, data_class="user", max_tokens=1500, ref=ref
        )
        raw_by_id = {r.get("claim_id"): r for r in result.data.get("judgments", [])}
        failed: list[ClaimEvidence] = []
        for ce in todo:
            raw = raw_by_id.get(ce.claim.id)
            j, why = ground(raw, ce.claim, pool, allowed[ce.claim.id]) if raw else (None, "missing")
            if j is not None:
                out[ce.claim.id] = j
            elif attempt == 0:
                failed.append(ce)
            else:
                out[ce.claim.id] = Judgment(
                    claim_id=ce.claim.id, label="unverified", grounded=False, confidence=0.4,
                    reason="We couldn't tie a record to this claim precisely enough to call it.",
                    engine="llm",
                )  # fmt: skip
        todo = failed
    return [out[ce.claim.id] for ce in items if ce.claim.id in out]


async def judge_all(
    router: LlmRouter | None, items: list[ClaimEvidence], ref: str
) -> tuple[list[Judgment], bool]:
    """Returns (judgments, used_llm). Falls back to rules if the LLM is unavailable."""
    if (
        router is not None
        and router.configured
        and any(not_checkable(ce.claim) is None and ce.hits for ce in items)
    ):
        try:
            return await judge_llm(router, items, ref), True
        except LlmUnavailable:
            pass
    return [judge_rules(ce) for ce in items], False
