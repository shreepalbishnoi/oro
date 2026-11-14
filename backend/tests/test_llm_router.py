"""LLM router policy: data-class routing, quotas, breaker, degradation, and the HTTP provider."""

import json

import httpx
import pytest

from app.core.config import Settings
from app.llm.providers import LlmResult, OpenAIStyleProvider, Provider, ProviderError, Refusal
from app.llm.router import LlmRouter, LlmUnavailable


class Fake(Provider):
    def __init__(self, name: str, *, user_ok: bool, fail: Exception | None = None) -> None:
        self.name, self.model, self.allows_user_content = name, f"{name}-m", user_ok
        self.fail = fail
        self.calls = 0

    async def complete_json(self, system, user, schema, schema_name, max_tokens):  # type: ignore[no-untyped-def]
        self.calls += 1
        if self.fail:
            raise self.fail
        return LlmResult(
            data={"ok": self.name},
            provider=self.name,
            model=self.model,
            cost_inr=0.5 if self.name == "anthropic" else 0,
        )


def settings(**kw: object) -> Settings:
    base = {
        "llm_mode": "live",
        "groq_daily_requests": 2,
        "gemini_daily_requests": 2,
        "llm_daily_budget_inr": 1.0,
    }
    return Settings(**{**base, **kw})  # type: ignore[arg-type]


async def call(router: LlmRouter, data_class: str = "user") -> LlmResult:
    return await router.json("t", "sys", "usr", {}, data_class=data_class)  # type: ignore[arg-type]


async def test_user_content_never_reaches_gemini(fake_redis) -> None:
    gem, groq = Fake("gemini", user_ok=False), Fake("groq", user_ok=True)
    r = LlmRouter(settings(), fake_redis, providers=[gem, groq])
    assert (await call(r, "user")).provider == "groq"
    assert gem.calls == 0
    groq.fail = ProviderError("groq", "down")
    with pytest.raises(LlmUnavailable):
        await call(r, "user")
    assert gem.calls == 0  # even when it's the only healthy provider


async def test_public_prefers_gemini_then_falls_back(fake_redis) -> None:
    gem, groq = Fake("gemini", user_ok=False), Fake("groq", user_ok=True)
    r = LlmRouter(settings(), fake_redis, providers=[groq, gem])
    assert (await call(r, "public")).provider == "gemini"
    gem.fail = ProviderError("gemini", "HTTP 500")
    assert (await call(r, "public")).provider == "groq"


async def test_daily_quota_moves_to_next_provider(fake_redis) -> None:
    groq, claude = Fake("groq", user_ok=True), Fake("anthropic", user_ok=True)
    r = LlmRouter(settings(), fake_redis, providers=[groq, claude])
    assert [(await call(r)).provider for _ in range(3)] == ["groq", "groq", "anthropic"]


async def test_groq_token_cap_and_public_share(fake_redis) -> None:
    class Tok(Fake):
        async def complete_json(self, *a):  # type: ignore[no-untyped-def]
            r = await super().complete_json(*a)
            r.input_tokens, r.output_tokens = 700, 300
            return r

    groq = Tok("groq", user_ok=True)
    r = LlmRouter(
        settings(groq_daily_requests=99, groq_daily_tokens=10_000, groq_public_token_share=0.3),
        fake_redis,
        providers=[groq],
    )
    await call(r, "public")  # 1,000 used; next public call would pass the 3,000 share
    with pytest.raises(LlmUnavailable):
        await call(r, "public")
    for _ in range(7):  # user checks keep the rest: 2,000 reserved per call, cap 10,000
        assert (await call(r, "user")).provider == "groq"
    with pytest.raises(LlmUnavailable):
        await call(r, "user")
    assert groq.calls == 8


async def test_claude_budget_stops_paid_calls(fake_redis) -> None:
    claude = Fake("anthropic", user_ok=True)
    r = LlmRouter(settings(llm_daily_budget_inr=1.0), fake_redis, providers=[claude])
    await call(r)  # ₹0.50
    await call(r)  # ₹1.00 -> budget reached
    with pytest.raises(LlmUnavailable):
        await call(r)
    assert claude.calls == 2


async def test_rate_limit_opens_breaker(fake_redis) -> None:
    groq = Fake("groq", user_ok=True, fail=ProviderError("groq", "rate limited", retry_after_s=20))
    r = LlmRouter(settings(groq_daily_requests=100), fake_redis, providers=[groq])
    with pytest.raises(LlmUnavailable):
        await call(r)
    groq.fail = None
    with pytest.raises(LlmUnavailable):  # still cooling down
        await call(r)
    assert groq.calls == 1
    assert await fake_redis.ttl("llm:cool:groq") > 0


async def test_refusal_is_not_retried_elsewhere(fake_redis) -> None:
    groq = Fake("groq", user_ok=True, fail=Refusal("groq", "refused"))
    claude = Fake("anthropic", user_ok=True)
    r = LlmRouter(settings(), fake_redis, providers=[groq, claude])
    with pytest.raises(LlmUnavailable):
        await call(r)
    assert claude.calls == 0


async def test_off_mode(fake_redis) -> None:
    r = LlmRouter(settings(llm_mode="off"), fake_redis, providers=[Fake("groq", user_ok=True)])
    with pytest.raises(LlmUnavailable):
        await call(r)


async def test_openai_style_provider_parses_strict_json() -> None:
    seen: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen.update(json.loads(req.content))
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": json.dumps({"claims": []})}}],
                "usage": {"prompt_tokens": 120, "completion_tokens": 9},
            },
        )

    p = OpenAIStyleProvider(
        "groq", "https://api.groq.test/openai/v1/", "k", "openai/gpt-oss-120b",
        allows_user_content=True, timeout_s=5, transport=httpx.MockTransport(handler),
    )  # fmt: skip
    r = await p.complete_json("sys", "usr", {"type": "object"}, "extract", 500)
    assert r.data == {"claims": []} and r.input_tokens == 120
    assert seen["response_format"]["json_schema"]["strict"] is True
    assert seen["messages"][0] == {"role": "system", "content": "sys"}


async def test_openai_style_provider_429_carries_retry_after() -> None:
    p = OpenAIStyleProvider(
        "groq", "https://api.groq.test/openai/v1/", "k", "m", allows_user_content=True, timeout_s=5,
        transport=httpx.MockTransport(lambda r: httpx.Response(429, headers={"retry-after": "7"})),
    )  # fmt: skip
    with pytest.raises(ProviderError) as e:
        await p.complete_json("s", "u", {}, "x", 10)
    assert e.value.retry_after_s == 7
