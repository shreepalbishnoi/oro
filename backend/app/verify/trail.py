"""Forward Trail (PLAN §9.3): how a tip spreads, from text-free fingerprints.

64-bit SimHash over word 3-shingles (numbers kept). Measured on real edits: a changed word,
amount or added line moves 8–10 bits; unrelated tips are 30+ apart. Variants are matched by
exact Hamming distance in SQL (`bit_count(a # b)`) over a recent window, since forwards
spread within days. Only hashes are stored, never text. Counts show only at ≥ 3 checks."""

import hashlib

from app.verify.text import normalize

MAX_DISTANCE = 12
WINDOW_DAYS = 90
PRIVACY_FLOOR = 3
_MASK64 = (1 << 64) - 1


def _h64(s: str) -> int:
    return int.from_bytes(hashlib.blake2b(s.encode(), digest_size=8).digest(), "big")


def simhash(text: str) -> int:
    words = normalize(text).split()
    if len(words) < 3:
        shingles = [" ".join(words)]
    else:
        shingles = [" ".join(words[i : i + 3]) for i in range(len(words) - 2)]
    v = [0] * 64
    for sh in shingles:
        h = _h64(sh)
        for i in range(64):
            v[i] += 1 if (h >> i) & 1 else -1
    out = 0
    for i in range(64):
        if v[i] > 0:
            out |= 1 << i
    return out


def exact_hash(text: str) -> str:
    return hashlib.sha256(normalize(text).encode()).hexdigest()


def hamming(a: int, b: int) -> int:
    return ((a ^ b) & _MASK64).bit_count()


def to_signed(h: int) -> int:
    """Postgres BIGINT is signed."""
    return h - (1 << 64) if h >= 1 << 63 else h


def from_signed(h: int) -> int:
    return h + (1 << 64) if h < 0 else h
