"""Web Push alerts (PLAN §9.6): only material, verified filings about what you hold.

Rules (fixed, same for everyone):
- material = a tier-1/2 source AND (a rumour denial OR a governance/solvency/regulator filing),
  never routine notices;
- the reader holds the company directly, or a fund they hold puts ≥ 2% in it;
- at most ALERTS_PER_DAY per person, one per document, none in quiet hours (22:00–07:00 IST);
  quiet-hour items simply wait in the feed.
Payloads are end-to-end encrypted by the Web Push protocol (aes128gcm) and carry only a title,
a short line and a link back to Room. Run `python -m app.alerts.push` to generate VAPID keys.
"""

import asyncio
import base64
import json
import logging
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from redis.asyncio import Redis
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.ratelimit import ist_day
from app.models import Document, PushSubscription

logger = logging.getLogger(__name__)
IST = ZoneInfo("Asia/Kolkata")
ALERTS_PER_DAY = 4
MIN_FUND_WEIGHT = 0.02
MATERIAL = re.compile(
    r"pledge|encumb|resign|auditor|default|insolvenc|nclt|sebi order|show cause|fraud|forensic|"
    r"downgrad|search and seizure|suspension|clarification|delay in (payment|servicing)",
    re.I,
)


def is_material(doc: Document) -> bool:
    return doc.tier <= 2 and (
        bool(doc.denies) or bool(MATERIAL.search(f"{doc.title} {doc.category or ''}"))
    )


def quiet_now(now: datetime | None = None) -> bool:
    h = (now or datetime.now(IST)).astimezone(IST).hour
    return h >= 22 or h < 7


def enabled() -> bool:
    s = get_settings()
    return bool(s.vapid_private_key and s.vapid_public_key)


def _send(sub: PushSubscription, payload: str) -> int:
    """Blocking HTTP call (pywebpush uses requests). Returns the push service's status."""
    from pywebpush import WebPushException, webpush

    s = get_settings()
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=payload,
            vapid_private_key=s.vapid_private_key.get_secret_value()
            if s.vapid_private_key
            else None,
            vapid_claims={"sub": s.vapid_subject or s.public_web_url},
            ttl=12 * 3600,
            timeout=10,
        )
        return 201
    except WebPushException as exc:
        return exc.response.status_code if exc.response is not None else 0


async def send_to_user(session: AsyncSession, user_id: int, payload: dict) -> int:
    subs = (
        await session.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id))
    ).all()
    body = json.dumps(payload, ensure_ascii=False)
    sent, gone = 0, []
    for sub in subs:
        status = await asyncio.to_thread(_send, sub, body)
        if status in (404, 410):
            gone.append(sub.id)
        elif 200 <= status < 300:
            sent += 1
    if gone:
        await session.execute(delete(PushSubscription).where(PushSubscription.id.in_(gone)))
        await session.commit()
    return sent


async def notify(
    session: AsyncSession,
    redis: Redis,
    doc: Document,
    users: dict[int, tuple[bool, float]],
    symbols: list[str],
) -> int:
    """Called from feed fan-out. Never raises: alerts must not break the pipeline."""
    if not enabled() or not is_material(doc) or quiet_now():
        return 0
    n = 0
    try:
        for uid, (direct, weight) in users.items():
            if not direct and weight < MIN_FUND_WEIGHT:
                continue
            if not await redis.set(f"push:sent:{uid}:{doc.id}", "1", nx=True, ex=7 * 86400):
                continue
            day_key = f"push:day:{ist_day()}:{uid}"
            if int(await redis.incr(day_key)) > ALERTS_PER_DAY:
                continue
            await redis.expire(day_key, 26 * 3600)
            label = "Rumour denied" if doc.denies else "Filing"
            who = ", ".join(symbols[:2]) or "A company you hold"
            n += await send_to_user(session, uid, {
                "title": f"{label}: {who}"[:80],
                "body": doc.title[:140],
                "url": "/room",
                "tag": f"doc-{doc.id}",
            })  # fmt: skip
    except Exception:  # noqa: BLE001
        logger.exception("push notify failed")
    return n


def generate_vapid() -> tuple[str, str]:
    """(public applicationServerKey, private key), both base64url without padding."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    priv = key.private_numbers().private_value.to_bytes(32, "big")
    pub = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )

    def b64(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

    return b64(pub), b64(priv)


if __name__ == "__main__":
    pub, priv = generate_vapid()
    print(f"VAPID_PUBLIC_KEY={pub}\nVAPID_PRIVATE_KEY={priv}")
