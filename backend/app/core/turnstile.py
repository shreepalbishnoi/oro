"""Cloudflare Turnstile verification. Skipped when no secret is configured (local dev)."""

import httpx

from app.core.config import get_settings

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str | None, remote_ip: str | None) -> bool:
    secret = get_settings().turnstile_secret
    if secret is None:
        return True
    if not token:
        return False
    data = {"secret": secret.get_secret_value(), "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(VERIFY_URL, data=data)
        return bool(resp.json().get("success"))
    except (httpx.HTTPError, ValueError):
        return False
