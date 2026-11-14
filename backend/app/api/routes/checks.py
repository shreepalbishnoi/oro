"""Parakh API (PLAN §9.7): create a check, stream it, read it, share it, report it."""

import json
import secrets
import time
from collections.abc import AsyncIterable
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, File, Header, Path, Query, Request, UploadFile, status
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select

from app.api.deps import CurrentUser, OptionalUser, RedisDep, SessionDep, SettingsDep
from app.core.crypto import keyed_hash
from app.core.errors import Problem
from app.core.ratelimit import take_burst, take_daily
from app.core.redis import get_blocking_redis
from app.core.turnstile import verify_turnstile
from app.ingest.linkread import LinkRefused, as_check_text, read_link
from app.llm.router import get_router
from app.llm.vision import MAX_IMAGE_BYTES, VisionUnavailable, transcribe
from app.models import Check, ErrorReport
from app.verify.engine import MAX_INPUT
from app.verify.scrub import scrub
from app.verify.service import create_check, start_check, stream_key

router = APIRouter(prefix="/v1", tags=["parakh"])

STREAM_MAX_S = 180  # a check that hasn't finished by now never will (worker restarted)
HEARTBEAT_MS = 15_000  # keeps Cloudflare from dropping idle SSE connections


class CheckIn(BaseModel):
    text: str = Field(min_length=8, max_length=MAX_INPUT)
    kind: Literal["text", "link", "image"] = "text"
    turnstile_token: str | None = Field(default=None, alias="turnstileToken")
    channel: Literal["web", "share"] = "web"


class CheckCreated(BaseModel):
    id: str
    status: str
    stream_url: str = Field(serialization_alias="streamUrl")
    remaining_today: int = Field(serialization_alias="remainingToday")


class CheckOut(BaseModel):
    id: str
    status: str
    created_at: datetime = Field(serialization_alias="createdAt")
    karat: int | None
    risk: str | None
    mode: str | None
    verdict: dict | None
    share_slug: str | None = Field(serialization_alias="shareSlug")


class CheckListItem(BaseModel):
    id: str
    created_at: datetime = Field(serialization_alias="createdAt")
    status: str
    karat: int | None
    risk: str | None
    preview: str


class ShareOut(BaseModel):
    slug: str
    url: str


class ReportIn(BaseModel):
    what: str = Field(min_length=3, max_length=1000)
    link: HttpUrl | None = None


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _to_out(c: Check) -> CheckOut:
    return CheckOut(
        id=c.public_id, status=c.status, created_at=c.created_at, karat=c.karat, risk=c.risk,
        mode=c.mode, verdict=c.verdict, share_slug=c.share_slug,
    )  # fmt: skip


async def _get_check(session: SessionDep, public_id: str) -> Check:
    check = await session.scalar(select(Check).where(Check.public_id == public_id))
    if check is None:
        raise Problem(404, "Check not found")
    return check


@router.post("/checks", status_code=status.HTTP_202_ACCEPTED, response_model_by_alias=True)
async def create(
    body: CheckIn,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    settings: SettingsDep,
    user: OptionalUser,
) -> CheckCreated:
    ip = _client_ip(request)
    ip_key = keyed_hash(ip, "ip")
    if not await take_burst(redis, f"checks:{ip_key}", per_minute=10):
        raise Problem(429, "Too many checks", "Wait a minute and try again.")
    if user is None and not await verify_turnstile(body.turnstile_token, ip):
        raise Problem(403, "Couldn't confirm you're human", "Reload the page and try again.")

    quota_key, limit = (
        (f"checks:user:{user.id}", settings.user_checks_per_day)
        if user
        else (f"checks:anon:{ip_key}", settings.anon_checks_per_day)
    )
    allowed, remaining = await take_daily(redis, quota_key, limit)
    if not allowed:
        detail = (
            "You've used today's checks. They reset at midnight IST."
            if user
            else "Sign in for more checks today. It's free."
        )
        raise Problem(429, "Daily limit reached", detail)

    text = body.text
    if body.kind == "link" and len(text.split()) == 1:
        try:
            text = as_check_text(await read_link(text))
        except LinkRefused:
            pass  # still check the URL itself (shorteners, look-alike domains, .apk links)
    check = await create_check(
        session, text, body.kind, body.channel, user.id if user else None,
        None if user else ip_key,
    )  # fmt: skip
    start_check(redis, get_router(redis), check, text, body.kind, body.channel)
    return CheckCreated(
        id=check.public_id,
        status=check.status,
        stream_url=f"/v1/checks/{check.public_id}/stream",
        remaining_today=remaining,
    )


@router.get("/checks/{public_id}/stream", response_class=EventSourceResponse)
async def stream(
    public_id: Annotated[str, Path(max_length=32)],
    session: SessionDep,
    last_event_id: Annotated[str | None, Header()] = None,
) -> AsyncIterable[ServerSentEvent]:
    await _get_check(session, public_id)
    await session.close()  # don't hold a DB connection for the life of the stream
    key = stream_key(public_id)
    cursor = last_event_id or "0-0"
    reader = get_blocking_redis()  # BLOCK outlasts the normal client's 2 s socket timeout
    deadline = time.monotonic() + STREAM_MAX_S
    while True:
        resp = await reader.xread({key: cursor}, block=HEARTBEAT_MS, count=50)
        if not resp:
            if time.monotonic() > deadline:
                yield ServerSentEvent(
                    data={"type": "error", "message": "The check took too long. Try again."}
                )
                return
            yield ServerSentEvent(comment="keep-alive")
            continue
        for _, entries in resp:
            for entry_id, fields in entries:
                cursor = entry_id
                event = json.loads(fields["e"])
                yield ServerSentEvent(data=event, id=entry_id)
                if event.get("type") in ("done", "error"):
                    return


@router.get("/checks/{public_id}", response_model_by_alias=True)
async def read(public_id: Annotated[str, Path(max_length=32)], session: SessionDep) -> CheckOut:
    return _to_out(await _get_check(session, public_id))


@router.get("/checks", response_model_by_alias=True)
async def history(
    user: CurrentUser,
    session: SessionDep,
    before: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[CheckListItem]:
    stmt = select(Check).where(Check.user_id == user.id)
    if before:
        stmt = stmt.where(Check.created_at < before)  # keyset pagination
    rows = (await session.scalars(stmt.order_by(Check.created_at.desc()).limit(limit))).all()
    return [
        CheckListItem(
            id=c.public_id,
            created_at=c.created_at,
            status=c.status,
            karat=c.karat,
            risk=c.risk,
            preview=c.redacted_text[:140],
        )  # fmt: skip
        for c in rows
    ]


@router.post("/checks/{public_id}/share", response_model_by_alias=True)
async def share(
    public_id: Annotated[str, Path(max_length=32)], session: SessionDep, settings: SettingsDep
) -> ShareOut:
    """Public verdict link, created only when the person taps Share (PLAN §11.2)."""
    check = await _get_check(session, public_id)
    if check.status != "done":
        raise Problem(409, "Check isn't finished yet")
    if not check.share_slug:
        check.share_slug = secrets.token_urlsafe(8)
        await session.commit()
    return ShareOut(slug=check.share_slug, url=f"{settings.public_web_url}/v/{check.share_slug}")


@router.get("/v/{slug}", response_model_by_alias=True)
async def public_verdict(
    slug: Annotated[str, Path(max_length=32)], session: SessionDep
) -> CheckOut:
    check = await session.scalar(select(Check).where(Check.share_slug == slug))
    if check is None or check.verdict is None:
        raise Problem(404, "Verdict not found")
    out = _to_out(check)
    out.id = ""  # the private check id never appears on a public page
    return out


@router.post("/checks/{public_id}/report", status_code=status.HTTP_202_ACCEPTED)
async def report(
    public_id: Annotated[str, Path(max_length=32)],
    body: ReportIn,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
) -> dict[str, bool]:
    if not await take_burst(redis, f"report:{keyed_hash(_client_ip(request), 'ip')}", per_minute=5):
        raise Problem(429, "Too many reports")
    check = await _get_check(session, public_id)
    session.add(
        ErrorReport(check_id=check.id, what=body.what, link=str(body.link) if body.link else None)
    )
    await session.commit()
    return {"ok": True}


class ImageText(BaseModel):
    text: str
    pii_removed: int = Field(serialization_alias="piiRemoved")
    remaining_today: int = Field(serialization_alias="remainingToday")


@router.post("/checks/read-image", response_model_by_alias=True)
async def read_image(
    request: Request,
    redis: RedisDep,
    settings: SettingsDep,
    user: OptionalUser,
    file: Annotated[UploadFile, File()],
) -> ImageText:
    """Screenshot → text (personal details removed) for the person to review, then check.
    The image is held in memory for this call only."""
    ip_key = keyed_hash(_client_ip(request), "ip")
    if not await take_burst(redis, f"img:{ip_key}", per_minute=6):
        raise Problem(429, "Too many screenshots", "Wait a minute and try again.")
    quota_key, limit = (
        (f"img:user:{user.id}", settings.user_images_per_day)
        if user
        else (f"img:anon:{ip_key}", settings.anon_images_per_day)
    )
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise Problem(413, "Screenshot too large", "Use an image under 4 MB.")
    allowed, remaining = await take_daily(redis, quota_key, limit)
    if not allowed:
        raise Problem(
            429,
            "Daily limit reached",
            "Paste the message text instead; text checks have their own limit.",
        )
    try:
        raw = await transcribe(redis, data)
    except ValueError as exc:
        raise Problem(415, "Unsupported image", "Upload a PNG, JPG or WebP screenshot.") from exc
    except VisionUnavailable as exc:
        raise Problem(
            503, "Can't read screenshots right now", "Copy the message text and paste it instead."
        ) from exc
    finally:
        del data
    if not raw:
        raise Problem(422, "No message found", "We couldn't find message text in that image.")
    redacted, n = scrub(raw)
    return ImageText(text=redacted, pii_removed=n, remaining_today=remaining)
