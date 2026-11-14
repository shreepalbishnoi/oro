"""Room API (PLAN §9.7): imports, holdings, X-ray, shock simulator, feed, Discover."""

import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Path, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text, update

from app.api.deps import CurrentUser, OptionalUser, RedisDep, SessionDep, SettingsDep
from app.core.crypto import keyed_hash
from app.core.errors import Problem
from app.core.ratelimit import take_burst, take_daily
from app.discover.rules import discover_for_story
from app.llm.router import get_router
from app.models import Consent, Instrument, Portfolio, User
from app.room import exposure as ex
from app.room import feed
from app.room.ask import MAX_Q
from app.room.ask import ask as ask_room
from app.room.holdings import add_manual, invalidate, load_positions, save_statement
from app.room.importers import ImportFailed, parse_broker_csv, parse_cas
from app.verify.advice import ADVICE_REFUSAL, is_advice_question

router = APIRouter(prefix="/v1", tags=["room"])

MAX_UPLOAD = 10 * 1024 * 1024
CONSENT_PURPOSE = "portfolio_analysis"
XRAY_TTL_S = 600


async def require_consent(session: SessionDep, user: User) -> None:
    latest = await session.scalar(
        select(Consent.granted)
        .where(Consent.user_id == user.id, Consent.purpose == CONSENT_PURPOSE)
        .order_by(Consent.recorded_at.desc(), Consent.id.desc())
        .limit(1)
    )
    if not latest:
        raise Problem(
            403, "Consent needed",
            "Room needs your consent to analyse your portfolio. You can withdraw it any time.",
            consent=CONSENT_PURPOSE,
        )  # fmt: skip


class ImportResult(BaseModel):
    portfolio_id: int = Field(serialization_alias="portfolioId")
    label: str
    imported: int
    unmatched: list[str]
    statement_date: str | None = Field(serialization_alias="statementDate")
    warnings: list[str] = []


async def _read_upload(file: UploadFile, allowed: tuple[str, ...]) -> bytes:
    name = (file.filename or "").lower()
    if not name.endswith(allowed):
        raise Problem(415, "Unsupported file", f"Upload a {' or '.join(allowed)} file.")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise Problem(413, "File too large", "Statements are under 10 MB.")
    return data


@router.post("/room/import/cas", response_model_by_alias=True, status_code=status.HTTP_201_CREATED)
async def import_cas(
    user: CurrentUser,
    session: SessionDep,
    redis: RedisDep,
    file: Annotated[UploadFile, File()],
    password: Annotated[str, Form(max_length=64)],
) -> ImportResult:
    await require_consent(session, user)
    data = await _read_upload(file, (".pdf",))
    try:
        # CPU-bound PDF parsing off the event loop; the password never leaves this call.
        stmt = await run_in_threadpool(parse_cas, data, password)
    except ImportFailed as exc:
        raise Problem(422, "Couldn't import the statement", str(exc)) from exc
    finally:
        del data, password
    p, n, unmatched = await save_statement(session, redis, user.id, stmt)
    await feed.backfill_user(session, redis, user.id)
    return ImportResult(
        portfolio_id=p.id, label=p.label, imported=n, unmatched=unmatched[:20],
        statement_date=stmt.statement_date.isoformat() if stmt.statement_date else None,
        warnings=stmt.warnings,
    )  # fmt: skip


@router.post("/room/import/csv", response_model_by_alias=True, status_code=status.HTTP_201_CREATED)
async def import_csv(
    user: CurrentUser,
    session: SessionDep,
    redis: RedisDep,
    file: Annotated[UploadFile, File()],
) -> ImportResult:
    await require_consent(session, user)
    data = await _read_upload(file, (".csv",))
    try:
        stmt = parse_broker_csv(data.decode("utf-8-sig", errors="replace"))
    except ImportFailed as exc:
        raise Problem(422, "Couldn't import the file", str(exc)) from exc
    p, n, unmatched = await save_statement(session, redis, user.id, stmt)
    await feed.backfill_user(session, redis, user.id)
    return ImportResult(
        portfolio_id=p.id, label=p.label, imported=n, unmatched=unmatched[:20], statement_date=None
    )


class ManualIn(BaseModel):
    instrument_id: int = Field(alias="instrumentId", gt=0)
    quantity: Decimal = Field(gt=0, le=Decimal("1e12"))


@router.post("/room/holdings", status_code=status.HTTP_201_CREATED)
async def add_holding(
    body: ManualIn, user: CurrentUser, session: SessionDep, redis: RedisDep
) -> dict[str, int]:
    await require_consent(session, user)
    if await session.get(Instrument, body.instrument_id) is None:
        raise Problem(404, "Instrument not found")
    hid = await add_manual(session, redis, user.id, body.instrument_id, body.quantity)
    await feed.backfill_user(session, redis, user.id)
    return {"holdingId": hid}


@router.get("/room/holdings")
async def holdings(user: CurrentUser, session: SessionDep) -> dict:
    valued = await ex.value_positions(session, await load_positions(session, user.id))
    items = [
        {
            "holdingId": v.position.holding_id,
            "portfolioId": v.position.portfolio_id,
            "account": v.position.portfolio_label,
            "source": v.position.source,
            "instrumentId": v.position.instrument.id,
            "symbol": v.position.instrument.nse_symbol or v.position.instrument.bse_code,
            "name": v.position.instrument.name,
            "kind": v.position.instrument.kind,
            "quantity": str(v.position.qty),
            "close": v.close,
            "isin": v.position.instrument.isin,
            "valueInr": round(v.value, 2) if v.close is not None else None,
            "asOf": v.as_of.isoformat() if v.as_of else None,
        }
        for v in valued
    ]
    total = sum(i["valueInr"] or 0 for i in items)
    as_of = max((v.as_of for v in valued if v.as_of), default=None)
    return {"items": items, "totalInr": round(total, 2), "asOf": as_of.isoformat() if as_of else None,
            "note": "Values use the last close, not live prices."}  # fmt: skip


@router.delete("/room/portfolios/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio(
    portfolio_id: Annotated[int, Path(gt=0)],
    user: CurrentUser,
    session: SessionDep,
    redis: RedisDep,
) -> None:
    res = await session.execute(
        delete(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user.id)
    )
    if not res.rowcount:
        raise Problem(404, "Portfolio not found")
    await session.commit()
    await invalidate(redis, user.id)
    # Rebuild the feed so stories about holdings that are gone disappear.
    await redis.delete(f"feed:{user.id}")
    await feed.backfill_user(session, redis, user.id)


async def _xray(session: SessionDep, redis: RedisDep, user_id: int) -> dict:
    cached = await redis.get(f"room:xray:{user_id}")
    if cached:
        return json.loads(cached)
    valued = await ex.value_positions(session, await load_positions(session, user_id))
    exposures, coverage = await ex.compute_exposures(session, valued)
    net = sum(v.value for v in valued)
    schemes = [v.position.instrument for v in valued if v.position.instrument.kind == "mf_scheme"]
    weights = await ex.fund_weights(session, [s.id for s in schemes])
    data = {
        "netWorthInr": round(net, 2),
        "asOf": max((v.as_of for v in valued if v.as_of), default=None),
        "exposures": [
            {
                "instrumentId": e.instrument_id,
                "symbol": e.symbol,
                "name": e.name,
                "sector": e.sector,
                "group": e.group,
                "directInr": round(e.direct, 2),
                "viaFundsInr": round(e.via_funds, 2),
                "totalInr": round(e.total, 2),
                "share": round(e.total / net, 6) if net else 0,
                "paths": [
                    {
                        "via": p.via,
                        "viaName": p.via_name,
                        "inr": round(p.inr, 2),
                        "weight": p.weight,
                    }
                    for p in e.paths
                ],
            }  # fmt: skip
            for e in exposures
        ],
        "groups": ex.split_by(exposures, "group"),
        "sectors": ex.split_by(exposures, "sector"),
        "sankey": ex.sankey(valued, exposures),
        "overlap": ex.overlap(weights, {s.id: s.name for s in schemes}),
        "coverage": coverage,
    }
    if data["asOf"]:
        data["asOf"] = data["asOf"].isoformat()
    await redis.set(f"room:xray:{user_id}", json.dumps(data), ex=XRAY_TTL_S)
    return data


@router.get("/room/xray")
async def xray(user: CurrentUser, session: SessionDep, redis: RedisDep) -> dict:
    return await _xray(session, redis, user.id)


class ShockIn(BaseModel):
    kind: Literal["company", "group", "sector"]
    target: str = Field(min_length=1, max_length=120)
    pct: float = Field(ge=-100, le=100)


@router.post("/room/shock")
async def shock(body: ShockIn, user: CurrentUser, session: SessionDep, redis: RedisDep) -> dict:
    x = await _xray(session, redis, user.id)
    exposures = [
        ex.Exposure(
            instrument_id=e["instrumentId"],
            symbol=e["symbol"],
            name=e["name"],
            sector=e["sector"],
            group=e["group"],
            direct=e["directInr"],
            via_funds=e["viaFundsInr"],
        )  # fmt: skip
        for e in x["exposures"]
    ]
    return ex.shock(exposures, x["netWorthInr"], body.kind, body.target, body.pct)


def _annotate_exposure(items: list[dict], x: dict) -> None:
    """Adds the reader's rupee exposure (direct + through funds) to each story card."""
    exposure = {e["instrumentId"]: e for e in x["exposures"]}
    for it in items:
        hits = [exposure[i] for i in it["instrumentIds"] if i in exposure]
        it["yourExposureInr"] = round(sum(h["totalInr"] for h in hits), 2) if hits else None
        it["viaFunds"] = sum(1 for h in hits for p in h["paths"] if p["via"] != "direct")


@router.get("/room/summary")
async def summary(user: CurrentUser, session: SessionDep, redis: RedisDep) -> dict:
    x = await _xray(session, redis, user.id)
    since = await feed.since_last_came(session, redis, user.id, user.last_seen_at)
    _annotate_exposure(since, x)
    await session.execute(
        update(User).where(User.id == user.id).values(last_seen_at=datetime.now(UTC))
    )
    await session.commit()
    top = x["exposures"][:5]
    return {
        "netWorthInr": x["netWorthInr"],
        "asOf": x["asOf"],
        "sinceYouLastCame": since,
        "lastSeenAt": user.last_seen_at.isoformat() if user.last_seen_at else None,
        "topExposures": [
            {
                "symbol": e["symbol"],
                "name": e["name"],
                "totalInr": e["totalInr"],
                "share": e["share"],
            }
            for e in top
        ],
        "topGroup": x["groups"][0] if x["groups"] else None,
    }


@router.get("/room/feed")
async def room_feed(
    user: CurrentUser,
    session: SessionDep,
    redis: RedisDep,
    cursor: Annotated[float | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    items, nxt = await feed.read_feed(session, redis, user.id, cursor, limit)
    _annotate_exposure(items, await _xray(session, redis, user.id))
    return {"items": items, "nextCursor": nxt}


@router.post("/stories/{story_id}/{action}", status_code=status.HTTP_204_NO_CONTENT)
async def story_action(
    story_id: Annotated[int, Path(gt=0)],
    action: Literal["read", "dismiss"],
    user: CurrentUser,
    redis: RedisDep,
) -> None:
    await feed.mark(redis, user.id, story_id, action)


@router.get("/discover")
async def discover(
    story_id: Annotated[int, Query(alias="story_id", gt=0)],
    user: CurrentUser,
    session: SessionDep,
    redis: RedisDep,
) -> dict:
    x = await _xray(session, redis, user.id)
    concentration = None
    rows = await session.execute(
        text(
            "SELECT i.industry FROM doc_entities de JOIN instruments i ON i.id = de.instrument_id "
            "WHERE de.document_id = :d ORDER BY de.centrality DESC LIMIT 1"
        ),
        {"d": story_id},
    )
    first = rows.first()
    if first and x["netWorthInr"]:
        sector = next((s for s in x["sectors"] if s["name"] == (first.industry or "Other")), None)
        if sector:
            concentration = {
                "label": f"{sector['name']} sector",
                "share": sector["share"],
                "inr": sector["inr"],
            }
    return await discover_for_story(session, story_id, concentration)


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=MAX_Q)


async def _has_consent(session: SessionDep, user: User) -> bool:
    try:
        await require_consent(session, user)
    except Problem:
        return False
    return True


@router.post("/room/ask")
async def room_ask(
    body: AskIn,
    request: Request,
    user: OptionalUser,
    session: SessionDep,
    redis: RedisDep,
    settings: SettingsDep,
) -> dict:
    """RAG over filings (+ the reader's computed exposure when signed in with consent). Never advice.

    Signed out, Ask answers from public filings only, with a small per-IP daily quota.
    """
    who = (
        f"user:{user.id}"
        if user
        else "anon:" + keyed_hash(request.client.host if request.client else "unknown", "ip")
    )
    if not await take_burst(redis, f"ask:{who}", per_minute=4):
        raise Problem(429, "Slow down a little", "Wait a minute before the next question.")
    if is_advice_question(body.question):  # refused for free, without an LLM call
        return {"answer": ADVICE_REFUSAL, "answerable": False, "refused": True, "mode": "refusal",
                "sources": [], "remainingToday": None, "note": "Not investment advice."}  # fmt: skip
    limit = settings.ask_room_per_day if user else settings.anon_ask_per_day
    allowed, remaining = await take_daily(redis, f"ask:{who}", limit)
    if not allowed:
        raise Problem(
            429, "That's today's questions",
            "Questions reset at midnight IST." if user else "Sign in for more questions. It's free.",
        )  # fmt: skip
    personal = user is not None and await _has_consent(session, user)
    x = await _xray(session, redis, user.id) if personal and user else {}
    r = await ask_room(session, get_router(redis), body.question, x, ref=f"ask:{who}")
    return {
        "answer": r.answer,
        "answerable": r.answerable,
        "refused": r.refused,
        "mode": r.mode,
        "sources": [
            {
                "id": s.id,
                "title": s.title,
                "url": s.url,
                "source": s.source,
                "publishedAt": s.published_at,
            }
            for s in r.sources
        ],
        "remainingToday": remaining,
        "personal": bool(x.get("exposures")),
        "note": "Answers come only from records. Not investment advice.",
    }
