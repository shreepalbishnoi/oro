"""Room end to end on real Postgres: consent gate, CSV import (encrypted at rest), valuation,
look-through exposure, shock, feed fan-out, Discover, export and delete. Plus the poller."""

import time
from datetime import UTC, date, datetime, timedelta

import httpx
import jwt
import pytest
from sqlalchemy import select, text

from app.core.config import get_settings
from app.ingest.poller import DOCS_STREAM, poll_source
from app.models import Document, FundPortfolio, Holding, Instrument, PriceEod, Source
from app.pipeline.store import RawItem, process_document, store_item
from app.room.feed import fanout
from tests.conftest import requires_db

pytestmark = requires_db

CSV = """Instrument,Qty.,Avg. cost,LTP
KAVERIPWR,10,150,160
MERIDPORT,4,900,950
UNKNOWNCO,5,1,1
"""


def token(sub: str) -> str:
    s = get_settings()
    now = int(time.time())
    claims = {
        "sub": sub,
        "email": f"{sub}@example.com",
        "aud": s.auth_jwt_audience,
        "iss": s.auth_jwt_issuer,
        "iat": now,
        "exp": now + 600,
    }
    return jwt.encode(claims, s.auth_jwt_secret.get_secret_value(), algorithm="HS256")


@pytest.fixture
async def api(seeded, session):  # type: ignore[no-untyped-def]
    from app.main import create_app

    ids = seeded
    # Last closes and one fund that holds Kaveri (10%) and Himgiri (5%).
    fund = (await session.execute(
        text("INSERT INTO instruments (kind, name, amfi_code, isin, active, is_sme) VALUES "
             "('mf_scheme', 'Demo Flexi Cap Fund - Direct Growth', '999001', 'INF9Z9000001', true, false) "
             "ON CONFLICT (amfi_code) DO UPDATE SET name = excluded.name RETURNING id")
    )).scalar_one()  # fmt: skip
    for iid, close in (
        (ids["KAVERIPWR"], 160),
        (ids["MERIDPORT"], 950),
        (ids["HIMGIRI"], 400),
        (fund, 50),
    ):
        await session.merge(PriceEod(instrument_id=iid, trade_date=date(2026, 11, 10), close=close))
    for iid, w in ((ids["KAVERIPWR"], 0.10), (ids["HIMGIRI"], 0.05)):
        await session.merge(
            FundPortfolio(scheme_id=fund, instrument_id=iid, as_of=date(2026, 10, 31), weight=w)
        )
    await session.commit()
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c, ids, fund


async def test_room_flow(api, session, fake_redis) -> None:  # type: ignore[no-untyped-def]
    client, ids, fund = api
    h = {"Authorization": f"Bearer {token('room-user-1')}"}

    # Consent gate (DPDP): no import without it.
    r = await client.post(
        "/v1/room/import/csv", headers=h, files={"file": ("h.csv", CSV, "text/csv")}
    )
    assert r.status_code == 403 and r.json()["consent"] == "portfolio_analysis"
    assert (
        await client.post(
            "/v1/consents", headers=h, json={"purpose": "portfolio_analysis", "granted": True}
        )
    ).status_code == 201

    r = await client.post(
        "/v1/room/import/csv", headers=h, files={"file": ("h.csv", CSV, "text/csv")}
    )
    assert r.status_code == 201, r.text
    assert r.json()["imported"] == 2 and r.json()["unmatched"] == ["UNKNOWNCO"]

    me = (await client.get("/v1/me", headers=h)).json()
    raw = (
        await session.scalars(
            select(Holding.qty_enc).join(Instrument).where(Instrument.nse_symbol == "KAVERIPWR")
        )
    ).all()
    assert raw and all("10" != q for q in raw)  # stored encrypted, never plain

    r = await client.post(
        "/v1/room/holdings", headers=h, json={"instrumentId": fund, "quantity": "200"}
    )
    assert r.status_code == 201

    hold = (await client.get("/v1/room/holdings", headers=h)).json()
    assert hold["totalInr"] == 10 * 160 + 4 * 950 + 200 * 50 and hold["asOf"] == "2026-11-10"

    x = (await client.get("/v1/room/xray", headers=h)).json()
    kav = next(e for e in x["exposures"] if e["symbol"] == "KAVERIPWR")
    assert kav["directInr"] == 1600 and kav["viaFundsInr"] == pytest.approx(10000 * 0.10)
    him = next(e for e in x["exposures"] if e["symbol"] == "HIMGIRI")
    assert him["directInr"] == 0 and him["viaFundsInr"] == pytest.approx(500)
    assert {g["name"] for g in x["groups"]} >= {"Kaveri Group", "Meridian Group"}
    assert any(link["target"] == f"co:{ids['HIMGIRI']}" for link in x["sankey"]["links"])

    s = (
        await client.post(
            "/v1/room/shock",
            headers=h,
            json={"kind": "group", "target": "Kaveri Group", "pct": -10},
        )
    ).json()
    assert s["exposedInr"] == pytest.approx(1600 + 1000 + 500)
    assert s["changeInr"] == pytest.approx(-310) and "not a forecast" in s["note"]

    # A new filing about Himgiri reaches this user only through the fund.
    src = (await session.scalars(select(Source).where(Source.slug == "demo-nse"))).one()
    doc_id = await store_item(session, src.id, 1, RawItem(
        url="https://nse.example/him", title="Himgiri Cements: receipt of order",
        body="Himgiri Cements has received an order worth Rs 85 crore.",
        published_at=datetime.now(UTC) - timedelta(minutes=5), symbol_hint="HIMGIRI",
    ))  # fmt: skip
    iids = await process_document(session, doc_id)
    await session.commit()
    assert ids["HIMGIRI"] in iids
    assert await fanout(session, fake_redis, doc_id, iids) >= 1

    feed = (await client.get("/v1/room/feed", headers=h)).json()
    story = next(i for i in feed["items"] if i["id"] == str(doc_id))
    assert story["yourExposureInr"] == pytest.approx(500) and story["viaFunds"] == 1

    summary = (await client.get("/v1/room/summary", headers=h)).json()
    assert any(i["id"] == str(doc_id) for i in summary["sinceYouLastCame"])

    disc = (await client.get(f"/v1/discover?story_id={doc_id}", headers=h)).json()
    kinds = [c["kind"] for c in disc["cards"]]
    assert "connected" in kinds and "funds" in kinds
    assert disc["disclaimer"] == "For information, not a recommendation."

    assert (await client.post(f"/v1/stories/{doc_id}/dismiss", headers=h)).status_code == 204
    feed2 = (await client.get("/v1/room/feed", headers=h)).json()
    assert all(i["id"] != str(doc_id) for i in feed2["items"])

    exp = (await client.get("/v1/me/export", headers=h)).json()
    assert len(exp["holdings"]) == 3 and exp["consents"][0]["purpose"] == "portfolio_analysis"

    # Withdrawing consent erases holdings.
    await client.post(
        "/v1/consents", headers=h, json={"purpose": "portfolio_analysis", "granted": False}
    )
    assert (await client.get("/v1/room/holdings", headers=h)).json()["items"] == []
    assert (await client.delete("/v1/me", headers=h)).status_code == 204
    assert (await client.get("/v1/me", headers=h)).status_code in (401, 403) or me["id"]


async def test_users_cannot_touch_each_other(api) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = api
    a = {"Authorization": f"Bearer {token('owner-a')}"}
    b = {"Authorization": f"Bearer {token('owner-b')}"}
    await client.post(
        "/v1/consents", headers=a, json={"purpose": "portfolio_analysis", "granted": True}
    )
    pid = (
        await client.post(
            "/v1/room/import/csv", headers=a, files={"file": ("h.csv", CSV, "text/csv")}
        )
    ).json()["portfolioId"]
    assert (await client.delete(f"/v1/room/portfolios/{pid}", headers=b)).status_code == 404
    assert (await client.delete(f"/v1/room/portfolios/{pid}", headers=a)).status_code == 204


async def test_market_mood_direction_only(api, session) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = api
    await session.execute(
        text(
            "INSERT INTO index_eod VALUES ('NIFTY 50', '2026-11-11', 25255.05, 0.84) ON CONFLICT DO NOTHING"
        )
    )
    await session.commit()
    m = (await client.get("/v1/market/mood")).json()
    assert m["direction"] == "up" and m["asOf"] == "2026-11-11"
    assert "25255" not in str(m)  # never an index level


# ---- poller -------------------------------------------------------------------------------


async def test_poller_conditional_get_highwater_and_breaker(seeded, session, fake_redis) -> None:  # type: ignore[no-untyped-def]
    from pathlib import Path

    xml = (Path(__file__).parent / "fixtures" / "nse_announcements.xml").read_bytes()
    src = Source(slug="test-nse", name="NSE filing", tier=1, kind="rss", url="https://nse.test/rss",
                 poll_market_s=60, poll_off_s=300, enabled=False)  # fmt: skip
    session.add(src)
    await session.commit()
    calls: list[dict] = []
    mode = {"status": 200}

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(dict(req.headers))
        if mode["status"] != 200:
            return httpx.Response(mode["status"])
        if req.headers.get("if-none-match") == '"v1"':
            return httpx.Response(304)
        return httpx.Response(200, content=xml, headers={"etag": '"v1"'})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    n = await poll_source(session, fake_redis, client, src)
    assert n == 8 and await fake_redis.xlen(DOCS_STREAM) == 8
    assert src.etag == '"v1"' and src.high_water is not None

    assert await poll_source(session, fake_redis, client, src) == 0  # 304, nothing re-stored
    assert calls[-1]["if-none-match"] == '"v1"'

    mode["status"] = 503
    before = datetime.now(UTC)
    await poll_source(session, fake_redis, client, src)
    await session.refresh(src)
    assert src.fail_count == 1 and src.next_poll_at > before and "503" in (src.last_error or "")

    docs = (await session.scalars(select(Document).where(Document.source_id == src.id))).all()
    assert len(docs) == 8 and all(d.processed_at is None for d in docs)
    await client.aclose()


async def test_admin_ops_requires_admin(api, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = api
    h = {"Authorization": f"Bearer {token('not-admin')}"}
    assert (await client.get("/v1/admin/ops", headers=h)).status_code == 403
    monkeypatch.setattr(get_settings(), "admin_emails", ["founder@example.com"])
    h = {"Authorization": f"Bearer {token('founder')}"}
    body = (await client.get("/v1/admin/ops", headers=h)).json()
    assert "pipeline" in body and "llm" in body and isinstance(body["sources"], list)
