"""Text normalisation and money extraction shared by the verify engine."""

import re
import unicodedata

_KEEP = set("%₹. ")


def _strip_symbols(text: str) -> str:
    out = []
    for ch in text:
        cat = unicodedata.category(ch)
        # Letters, numbers and combining marks (Devanagari matras) survive.
        if ch in _KEEP or cat[0] in ("L", "N") or cat in ("Mn", "Mc"):
            out.append(ch)
        else:
            out.append(" ")
    return "".join(out)


def normalize(text: str) -> str:
    """Lowercase, NFKC, drop emoji and punctuation (keeps %, ₹ and '.')."""
    t = unicodedata.normalize("NFKC", text.lower())
    return re.sub(r"\s+", " ", _strip_symbols(t)).strip()


def is_pictographic(ch: str) -> bool:
    return unicodedata.category(ch) == "So"


_NUM = re.compile(
    r"(?:rs\.?|₹|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|k|%|x)?",
    re.IGNORECASE,
)


def numbers_in(s: str, money_only: bool = True) -> list[float]:
    """Numbers in a sentence, normalised to ₹ crore when a unit is present."""
    out: list[float] = []
    for m in _NUM.finditer(s):
        try:
            v = float(m.group(1).replace(",", ""))
        except ValueError:
            continue
        unit = (m.group(2) or "").lower()
        if unit in ("lakh", "lac"):
            v = v / 100
        if unit in ("%", "x"):
            continue  # percentages are promises or ratios, not amounts
        has_currency = bool(re.match(r"^(rs|₹|inr)", m.group(0).strip(), re.IGNORECASE))
        if money_only and not has_currency and unit not in ("crore", "cr", "lakh", "lac"):
            continue
        if v == 0:
            continue
        out.append(v)
    return out


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?।])\s+|\n+", text)
    out = []
    for p in parts:
        s = re.sub(r"^[\s*•\-–>]+", "", p).strip()
        visible = "".join(ch for ch in s if not is_pictographic(ch)).strip()
        if len(visible) >= 12:
            out.append(s)
    return out


def norm_quote(s: str) -> str:
    """Whitespace-, comma- and case-insensitive form used by the grounding check."""
    return re.sub(r"\s+", " ", s).replace(",", "").lower().strip()
