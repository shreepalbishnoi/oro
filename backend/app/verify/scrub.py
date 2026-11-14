"""PII scrubber (PLAN §12). Runs before anything is stored, shown, shared or sent to an LLM.
Order matters: longer, more specific patterns first."""

import re

_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[email]"),
    (re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"), "[PAN]"),
    (re.compile(r"\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b"), "[Aadhaar]"),
    (re.compile(r"(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b"), "[phone]"),
    (re.compile(r"\b\d{9,18}\b"), "[account no.]"),
    # UPI handle (name@bank). The handle is personal; the scam signal is kept separately.
    (re.compile(r"\b[\w.-]{2,}@(?!gmail|yahoo|outlook|hotmail)[a-z]{2,12}\b", re.I), "[UPI id]"),
]


def scrub(text: str) -> tuple[str, int]:
    removed = 0
    out = text
    for pattern, label in _RULES:
        out, n = pattern.subn(label, out)
        removed += n
    return out, removed
