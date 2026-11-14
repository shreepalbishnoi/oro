"""Ask Room safety: advice refused without an LLM call; uncited answers never reach the reader."""

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from app.retrieval.hybrid import Hit
from app.room import ask as ask_mod

XRAY = {
    "netWorthInr": 100000.0,
    "exposures": [
        {
            "instrumentId": 7,
            "name": "Kaveri Power Ltd",
            "totalInr": 40000.0,
            "share": 0.4,
            "viaFundsInr": 0,
            "sector": "Power",
            "group": None,
        },  # fmt: skip
    ],
    "groups": [{"name": "Independent", "inr": 100000.0, "share": 1.0}],
    "sectors": [{"name": "Power", "inr": 40000.0, "share": 0.4}],
}


@dataclass
class R:
    data: dict


class FakeRouter:
    def __init__(self, data: dict) -> None:
        self.data, self.calls = data, 0

    async def json(self, *a, **kw):  # type: ignore[no-untyped-def]
        self.calls += 1
        assert (
            kw["data_class"] == "user"
        )  # the question is user content: never the free Gemini tier
        return R(self.data)


@pytest.fixture
def no_db(monkeypatch: pytest.MonkeyPatch) -> None:
    async def link(session, text, limit=6):  # type: ignore[no-untyped-def]
        return [], {}

    hit = Hit(chunk_id=1, document_id=1, text="Kaveri Power won an order worth ₹420 crore.", title="Order win",
              url="https://example.com/f", source="NSE", tier=1, published_at=datetime.now(UTC),
              denies=False, score=1.0)  # fmt: skip

    async def search(session, q, **kw):  # type: ignore[no-untyped-def]
        return [hit]

    monkeypatch.setattr(ask_mod, "link_entities", link)
    monkeypatch.setattr(ask_mod, "search", search)


async def test_advice_question_is_refused_without_llm(no_db) -> None:
    r = FakeRouter({})
    out = await ask_mod.ask(None, r, "Should I sell Kaveri Power now?", XRAY)  # type: ignore[arg-type]
    assert out.refused and r.calls == 0


async def test_uncited_answer_is_replaced(no_db) -> None:
    r = FakeRouter(
        {"answer": "Kaveri will double next year.", "citations": ["E99"], "answerable": True}
    )
    out = await ask_mod.ask(None, r, "What happened at Kaveri Power?", XRAY)  # type: ignore[arg-type]
    assert not out.answerable and "doesn't have a filing" in out.answer and out.sources == []


async def test_cited_answer_keeps_sources_and_filters_advice(no_db) -> None:
    r = FakeRouter({
        "answer": "Kaveri Power filed an order win worth ₹420 crore. You should buy more.",
        "citations": ["E1", "F2"], "answerable": True,
    })  # fmt: skip
    out = await ask_mod.ask(None, r, "Any news on Kaveri Power?", XRAY)  # type: ignore[arg-type]
    assert out.answerable and {s.id for s in out.sources} == {"E1", "F2"}
    assert "buy" not in out.answer.lower() and "₹420 crore" in out.answer
