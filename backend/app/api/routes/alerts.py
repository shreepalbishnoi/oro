"""Alerts API (PLAN §9.7): Web Push subscription and a test notification."""

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert

from app.alerts import push
from app.api.deps import CurrentUser, RedisDep, SessionDep, SettingsDep
from app.core.errors import Problem
from app.core.ratelimit import take_daily
from app.models import PushSubscription

router = APIRouter(prefix="/v1", tags=["alerts"])


class Keys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=200)
    auth: str = Field(min_length=8, max_length=100)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=1000, pattern=r"^https://")
    keys: Keys


@router.get("/push/key")
async def push_key(settings: SettingsDep) -> dict:
    return {"publicKey": settings.vapid_public_key if push.enabled() else None}


@router.post("/push/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    body: SubscriptionIn, user: CurrentUser, session: SessionDep
) -> dict[str, bool]:
    if not push.enabled():
        raise Problem(503, "Alerts aren't switched on yet")
    stmt = insert(PushSubscription).values(
        user_id=user.id, endpoint=body.endpoint, p256dh=body.keys.p256dh, auth=body.keys.auth
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[PushSubscription.endpoint],
            set_={"user_id": user.id, "p256dh": body.keys.p256dh, "auth": body.keys.auth},
        )
    )
    await session.commit()
    return {"ok": True}


class EndpointIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=1000)


@router.post("/push/unsubscribe")
async def unsubscribe(body: EndpointIn, user: CurrentUser, session: SessionDep) -> dict[str, bool]:
    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user.id, PushSubscription.endpoint == body.endpoint
        )
    )
    await session.commit()
    return {"ok": True}


@router.post("/push/test")
async def test_push(user: CurrentUser, session: SessionDep, redis: RedisDep) -> dict[str, int]:
    allowed, _ = await take_daily(redis, f"push:test:{user.id}", 5)
    if not allowed:
        raise Problem(429, "That's enough tests for today")
    sent = await push.send_to_user(session, user.id, {
        "title": "ORO alerts are on",
        "body": "You'll hear from ORO only when a material, verified filing touches your money.",
        "url": "/room",
        "tag": "oro-test",
    })  # fmt: skip
    return {"sent": sent}
