import re
import unicodedata

# Corporate suffixes that carry no identity; stripped so "Tata Motors Ltd." == "TATA MOTORS LIMITED".
_SUFFIXES = re.compile(
    r"\b(limited|ltd|pvt|private|public|co|company|corporation|corp|inc|plc)\b\.?",
    re.IGNORECASE,
)
_SPACES = re.compile(r"\s+")


def _keep(ch: str) -> bool:
    # Letters, digits and combining marks (Devanagari matras/viramas are category M, not \w).
    return unicodedata.category(ch)[0] in {"L", "N", "M"}


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation and corporate suffixes; keeps Indic scripts intact."""
    text = unicodedata.normalize("NFKC", name).casefold().replace("&", " and ")
    text = "".join(ch if _keep(ch) else " " for ch in text)
    text = _SUFFIXES.sub(" ", text)
    return _SPACES.sub(" ", text).strip()
