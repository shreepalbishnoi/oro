"""Advice filter (PLAN §9.2). Every sentence ORO writes passes through `guard`.
ORO describes evidence; it never tells anyone what to do with a stock."""

import logging
import re

from app.core.logging import log_extra

logger = logging.getLogger(__name__)

_PATTERNS = [
    re.compile(p, re.I)
    for p in (
        r"\b(you|we|i)\s+(should|must|can|could)\s+(buy|sell|hold|invest|exit|accumulate|average)\b",
        r"\b(buy|sell|accumulate|exit)\s+(now|today|this|the stock|it|on dips?|at)\b",
        r"\b(hold|keep holding)\s+(it|the stock|for)\b",
        r"\bbook\s+profits?\b",
        r"\bstop[\s-]?loss\b",
        r"\btarget\s+(price\s+)?(of\s+)?₹?\s?\d",
        r"\b(strong\s+)?(buy|sell)\s+(call|rating|signal|recommendation)\b",
        r"\bshould\s+invest\b",
        r"\b(kharid\s?(o|lo|na|le|lijiye)|bech\s?(o|do|na|de|dijiye)|le\s+lo|nikal\s+lo)\b",
        r"\b(will|is going to)\s+(rise|fall|go up|go down|double|crash)\b",
        r"(खरीद|बेच)\s*(लो|दो|लें|दें)",
    )
]

FALLBACK = "ORO only describes what records show. It does not suggest any action on a stock."

ADVICE_REFUSAL = (
    "I can't tell you whether to put money into or take money out of any stock; that would be "
    "investment advice, and ORO isn't registered to give it. What I can do is show you what the "
    "filings, surveillance lists and disclosures say, and how much of your money is exposed. "
    "Want that instead?"
)

_QUESTION = re.compile(
    r"\b(should|shall|can|kya)\s+(i|we|mai|main|hum)\b.*\b(buy|sell|hold|invest|exit|kharid|bech|average|add)\b"
    r"|\b(buy|sell|hold)\s+(or|ya)\s+(sell|hold|buy)\b"
    r"|\b(good|right)\s+time\s+to\s+(buy|sell|invest|enter|exit)\b"
    r"|\btarget\s+(price|kya)\b",
    re.I,
)


def advice_leak(sentence: str) -> re.Pattern[str] | None:
    for p in _PATTERNS:
        if p.search(sentence):
            return p
    return None


def guard(text: str) -> str:
    """Drop any advice-like sentence. Every block is logged (target: zero in production)."""
    parts = re.split(r"(?<=[.!?])\s+", text)
    kept: list[str] = []
    blocked = 0
    for s in parts:
        if advice_leak(s):
            blocked += 1
            continue
        kept.append(s)
    if not blocked:
        return text
    logger.warning("advice filter blocked text", extra=log_extra(blocked=blocked))
    return " ".join(kept) or FALLBACK


def is_advice_question(q: str) -> bool:
    return bool(_QUESTION.search(q))
