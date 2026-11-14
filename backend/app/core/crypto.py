"""Keyed hashing and field-level encryption (PLAN §8 privacy, §12 financial data)."""

import base64
import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings


def keyed_hash(value: str, purpose: str) -> str:
    """HMAC-SHA256 with a server pepper. `purpose` separates domains (ip, pan, anon)."""
    pepper = get_settings().hash_pepper.get_secret_value().encode()
    msg = f"{purpose}:{value}".encode()
    return hmac.new(pepper, msg, hashlib.sha256).hexdigest()


def _aead() -> AESGCM:
    key = base64.b64decode(get_settings().field_key_b64.get_secret_value())
    if len(key) != 32:
        raise ValueError("FIELD_KEY_B64 must decode to 32 bytes")
    return AESGCM(key)


def encrypt_field(plain: str, aad: str = "") -> str:
    nonce = os.urandom(12)
    ct = _aead().encrypt(nonce, plain.encode(), aad.encode() or None)
    return base64.b64encode(nonce + ct).decode()


def decrypt_field(token: str, aad: str = "") -> str:
    raw = base64.b64decode(token)
    return _aead().decrypt(raw[:12], raw[12:], aad.encode() or None).decode()
