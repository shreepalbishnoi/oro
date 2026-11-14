"""End-to-end Parakh against a real Postgres (+pgvector): engine on the fictional demo records,
the LLM path with grounding, Forward Trail, and the HTTP API with SSE."""

import json

import httpx
import pytest

from app.devtools.demo import SAMPLE_TIPS
from app.llm.prompts import EXTRACT_VERSION  # noqa: F401  (import keeps prompts importable)
from app.llm.providers import LlmResult, Provider
from app.llm.router import LlmRouter
from app.verify.engine import AssayInput, assay_once
from tests.conftest import requires_db

pytestmark = requires_db


def labels(v) -> list[str]:  # type: ignore[no-untyped-def]
    return [j.label for j in v.judgments]


async def test_kaveri_inflated_order(session) -> None:
    v = await assay_once(session, None, AssayInput(raw=SAMPLE_TIPS["kaveri"], record_trail=False))
    assert any(e.symbol == "KAVERIPWR" for e in v.entities)
    conflict = next(j for j in v.judgments if j.label == "conflicting")
    assert "420" in conflict.reason and conflict.grounded and conflict.doc
    assert v.risk == "high" and v.karat < 6
    assert v.mode == "records-only"
    assert "profitking" not in v.input.redacted


async def test_surya_denial_and_surveillance(session) -> None:
    v = await assay_once(session, None, AssayInput(raw=SAMPLE_TIPS["surya"], record_trail=False))
    assert "conflicting" in labels(v)
    sig = {s.id for s in v.signals}
    assert {"surveillance", "sme_low_float", "guaranteed_returns", "private_group"} <= sig
    assert any(d.party == "Ridgeline Trading LLP" for d in v.other_side)


async def test_meridian_factual_message(session) -> None:
    v = await assay_once(session, None, AssayInput(raw=SAMPLE_TIPS["meridian"], record_trail=False))
    assert labels(v).count("supported") >= 2
    assert v.risk == "low" and v.karat >= 18


async def test_fake_app_tip(session) -> None:
    v = await assay_once(session, None, AssayInput(raw=SAMPLE_TIPS["app"], record_trail=False))
    assert {"link_apk", "link_lookalike", "guaranteed_returns", "fake_authority"} <= {
        s.id for s in v.signals
    }
    assert v.risk == "high"


async def test_forward_trail_counts_variants(session) -> None:
    base = SAMPLE_TIPS["kaveri"] + " trail-test"
    for text in (base, base, base.replace("aaj hi lo", "abhi lo")):
        v = await assay_once(session, None, AssayInput(raw=text, channel="web"))
    assert v.trail is not None
    assert v.trail.count == 3 and v.trail.variants == 2


class ScriptedLlm(Provider):
    """Plays the extract and judge roles with fixed outputs, to exercise the LLM path."""

    name, model, allows_user_content = "groq", "scripted", True

    def __init__(self, judge_quote: str) -> None:
        self.judge_quote = judge_quote
        self.calls: list[str] = []

    async def complete_json(self, system, user, schema, schema_name, max_tokens):  # type: ignore[no-untyped-def]
        self.calls.append(schema_name)
        if schema_name == "extract":
            data = {
                "language": "hinglish",
                "claims": [
                    {
                        "text": "Kaveri Power received an order worth ₹4,200 crore.", "kind": "corporate_event",
                        "company": "Kaveri Power", "symbol": "KAVERIPWR", "amounts_crore": [4200],
                        "hedging": False, "attribution": "none", "checkable": True,
                    },
                    {
                        "text": "Target price 180.", "kind": "price_call", "company": "Kaveri Power",
                        "symbol": None, "amounts_crore": [], "hedging": False, "attribution": "none",
                        "checkable": False,
                    },
                ],
            }  # fmt: skip
        else:
            evidence = json.loads(user.split("<records>\n", 1)[1].rsplit("\n</records>", 1)[0])
            eid = evidence["claims"][0]["evidence_ids"][0]
            data = {"judgments": [{
                "claim_id": "c1", "label": "conflicting", "evidence_id": eid, "quote": self.judge_quote,
                "reason": "The filing gives ₹420 crore, a tenth of the message's figure. You should sell now.",
                "confidence": 0.9,
            }]}  # fmt: skip
        return LlmResult(data=data, provider=self.name, model=self.model)


def router_with(fake_redis, provider: Provider) -> LlmRouter:  # type: ignore[no-untyped-def]
    from app.core.config import Settings

    return LlmRouter(
        Settings(llm_mode="live", groq_daily_requests=100), fake_redis, providers=[provider]
    )


async def test_llm_path_grounded_and_advice_filtered(session, fake_redis) -> None:
    p = ScriptedLlm("valued at Rs 420 crore")
    v = await assay_once(
        session,
        router_with(fake_redis, p),
        AssayInput(raw=SAMPLE_TIPS["kaveri"], record_trail=False),
    )
    assert p.calls == ["extract", "judge"]  # two requests per check, whatever the claim count
    j = v.judgments[0]
    assert j.label == "conflicting" and j.engine == "llm" and j.grounded
    assert "sell" not in j.reason.lower()  # advice sentence dropped by the filter
    assert v.mode == "assay"
    assert v.judgments[1].label == "unverified"  # price call is never judged


async def test_llm_hallucinated_quote_becomes_unverified(session, fake_redis) -> None:
    p = ScriptedLlm("received an order worth Rs 4,200 crore")  # not in any record
    v = await assay_once(
        session,
        router_with(fake_redis, p),
        AssayInput(raw=SAMPLE_TIPS["kaveri"], record_trail=False),
    )
    assert p.calls == ["extract", "judge", "judge"]  # one grounding retry
    assert v.judgments[0].label == "unverified" and v.judgments[0].grounded is False


# ---- HTTP API ---------------------------------------------------------------------------------


@pytest.fixture
async def client(seeded):  # type: ignore[no-untyped-def]
    from app.main import create_app

    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def read_stream(client: httpx.AsyncClient, url: str) -> list[dict]:
    events = []
    async with client.stream("GET", url) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        async for line in resp.aiter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
                if events[-1]["type"] in ("done", "error"):
                    break
    return events


async def test_api_check_stream_share_report(client) -> None:
    r = await client.post("/v1/checks", json={"text": SAMPLE_TIPS["meridian"]})
    assert r.status_code == 202, r.text
    body = r.json()
    events = await read_stream(client, body["streamUrl"])
    types = [e["type"] for e in events]
    assert types[0] == "stage" and types[-1] == "done"
    assert {"scrubbed", "claims", "judgment", "karat"} <= set(types)
    done = events[-1]
    assert done["verdict"]["risk"] == "low" and done["checkId"] == body["id"]
    assert "karatParts" in done["verdict"]  # camelCase, same as the web app's types

    got = (await client.get(f"/v1/checks/{body['id']}")).json()
    assert got["status"] == "done" and got["karat"] == done["verdict"]["karat"]

    share = (await client.post(f"/v1/checks/{body['id']}/share")).json()
    public = (await client.get(f"/v1/v/{share['slug']}")).json()
    assert public["verdict"]["karat"] == got["karat"] and public["id"] == ""

    rep = await client.post(
        f"/v1/checks/{body['id']}/report", json={"what": "Dividend is Rs 8, not 7"}
    )
    assert rep.status_code == 202


async def test_api_resume_stream_with_last_event_id(client) -> None:
    body = (await client.post("/v1/checks", json={"text": SAMPLE_TIPS["app"]})).json()
    first = await read_stream(client, body["streamUrl"])
    assert first[-1]["type"] == "done"
    # A reconnect from the middle replays only what came after.
    async with client.stream("GET", body["streamUrl"]) as resp:
        ids = [x[4:] async for x in resp.aiter_lines() if x.startswith("id: ")]
    mid = ids[len(ids) // 2]
    async with client.stream("GET", body["streamUrl"], headers={"Last-Event-ID": mid}) as resp:
        rest = [x async for x in resp.aiter_lines() if x.startswith("id: ")]
    assert len(rest) == len(ids) - len(ids) // 2 - 1


async def test_api_anonymous_daily_limit_and_problem_json(client) -> None:
    for _ in range(3):
        assert (
            await client.post("/v1/checks", json={"text": "Some forwarded tip text " * 2})
        ).status_code == 202
    r = await client.post("/v1/checks", json={"text": "Some forwarded tip text " * 2})
    assert r.status_code == 429
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["title"] == "Daily limit reached"


async def test_api_validation_is_problem_json(client) -> None:
    r = await client.post("/v1/checks", json={"text": "short"})
    assert r.status_code == 422 and r.json()["title"] == "Check the input"
