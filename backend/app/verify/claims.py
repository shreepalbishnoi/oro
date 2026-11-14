"""Rule-based claim extraction: the always-available fallback for the LLM extractor
(same claim schema). Used when AI is paused or a provider fails."""

import re

from app.verify.entities import entity_in
from app.verify.scrub import scrub
from app.verify.text import numbers_in, split_sentences
from app.verify.types import Claim, ClaimKind, Entity

IC = re.IGNORECASE
EVENT = re.compile(
    r"\b(order|contract|letter of award|loa|deal|merger|merge|acquisition|acquire|acquiring"
    r"|takeover|buyback|bonus|split|dividend|results?|profit|revenue|loss|stake|approval|approved"
    r"|tie[\s-]?up|partnership|jv|joint venture|pledge|fund ?rais|qip|ipo|listing|expansion"
    r"|plant|capacity)\b",
    IC,
)
PROMISE = re.compile(
    r"\b\d{2,4}\s?%|\bdouble\b|\bguarantee|\bassured|\bpakka\b|\bsure\s?shot\b|\bmultibagger\b|\b\d+x\b",
    IC,
)
PRICE = re.compile(r"\b(target|tgt|tp|sl|stop\s?loss|entry|cmp)\b\s*[:\-–]?\s*(₹|rs\.?)?\s?\d+", IC)
PRICE_ALL = re.compile(
    r"(target|tgt|tp|sl|stop\s?loss|entry|cmp)\s*[:\-–]?\s*(₹|rs\.?)?\s?\d+(\.\d+)?", IC
)
REG = re.compile(r"\bsebi\b.*\b(regd|registered|registration)\b|\bINH\d{9}\b", IC)
HEDGE = re.compile(
    r"\b(sources say|sources said|reportedly|rumou?r|buzz|likely|may|might|could|expected"
    r"|sun(a|ne)\s+(hai|mein)|khabar|chatter|speculat|in talks|talks)\b",
    IC,
)
NAMED = re.compile(
    r"\b(as per|according to|filed|filing|announced|exchange|press release|reg(ulation)? 30|bse|nse)\b",
    IC,
)
ANON = re.compile(r"\b(sources?|people|someone|log)\b", IC)


def kind_of(s: str) -> ClaimKind | None:
    if REG.search(s):
        return "registration"
    if EVENT.search(s):
        return "corporate_event"
    if PRICE.search(s):
        return "price_call"
    if PROMISE.search(s):
        return "return_promise"
    return None


def attribution_of(s: str) -> str:
    if NAMED.search(s):
        return "named"
    return "anonymous" if ANON.search(s) else "none"


def extract_claims_rules(
    raw: str, entities: list[Entity], aliases: dict[str, set[str]], max_claims: int = 5
) -> list[Claim]:
    claims: list[Claim] = []
    last_subject = entities[0] if entities else None
    for s in split_sentences(raw):
        kind = kind_of(s)
        here = entity_in(s, entities, aliases)
        if here:
            last_subject = here
        subject = here or last_subject
        if not kind:
            continue
        text = scrub(s)[0]
        claims.append(
            Claim(
                id=f"c{len(claims) + 1}",
                text=text if len(text) <= 220 else f"{text[:217]}…",
                kind=kind,
                subject=subject if kind in ("corporate_event", "price_call") else None,
                numbers=numbers_in(PRICE_ALL.sub(" ", s)) if kind == "corporate_event" else [],
                hedging=bool(HEDGE.search(s)),
                attribution=attribution_of(s),  # type: ignore[arg-type]
                checkable=kind in ("corporate_event", "registration"),
            )
        )
        if len(claims) >= max_claims:
            break
    return claims
