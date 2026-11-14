"""LLM router (PLAN §2.3): picks a provider per call by data class, quota and health.

Data classes:
- "user":   text a person submitted (already PII-scrubbed). Groq first (no training, no
            retention by default), then Claude if configured. Never Gemini's free tier.
- "public": exchange filings and news. Gemini free tier first, then Groq, then Claude.

Every call is quota-checked (Redis, per IST day), breaker-checked, logged to `llm_calls`, and
can be replayed from recorded fixtures (LLM_MODE=replay) so tests and CI never call providers.
When nothing is available the caller gets `LlmUnavailable` and falls back to rules + records."""

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Literal

from redis.asyncio import Redis

from app.core.config import Settings, get_settings
from app.core.logging import log_extra
from app.core.ratelimit import ist_day
from app.llm.providers import (
    AnthropicProvider,
    LlmResult,
    OpenAIStyleProvider,
    Provider,
    ProviderError,
    Refusal,
)

logger = logging.getLogger(__name__)

DataClass = Literal["user", "public"]
FIXTURE_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "llm"

GROQ_URL = "https://api.groq.com/openai/v1/"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


class LlmUnavailable(Exception):
    """No provider could serve the call. Callers degrade to rules + records."""


def fixture_key(purpose: str, system: str, user: str) -> str:
    return hashlib.sha256(f"{purpose}\x00{system}\x00{user}".encode()).hexdigest()[:24]


class LlmRouter:
    def __init__(
        self,
        settings: Settings,
        redis: Redis,
        providers: list[Provider] | None = None,
        call_log=None,  # async callable(LlmResult, purpose, status, ref) -> None
    ) -> None:
        self.s = settings
        self.redis = redis
        self.providers = providers if providers is not None else self._build(settings)
        self._log = call_log
        self._daily_cap = {
            "groq": settings.groq_daily_requests,
            "gemini": settings.gemini_daily_requests,
        }
        # Groq's free plan caps tokens per day (200K for gpt-oss-120b), which binds before requests.
        self._token_cap = {"groq": settings.groq_daily_tokens}

    @staticmethod
    def _build(s: Settings) -> list[Provider]:
        out: list[Provider] = []
        if s.groq_api_key:
            out.append(
                OpenAIStyleProvider(
                    "groq", GROQ_URL, s.groq_api_key.get_secret_value(), s.groq_model,
                    allows_user_content=True, timeout_s=s.llm_timeout_s,
                )
            )  # fmt: skip
        if s.gemini_api_key:
            out.append(
                OpenAIStyleProvider(
                    "gemini", GEMINI_URL, s.gemini_api_key.get_secret_value(), s.gemini_model,
                    allows_user_content=False, timeout_s=s.llm_timeout_s,
                )
            )  # fmt: skip
        if s.anthropic_api_key:
            out.append(AnthropicProvider(s))
        return out

    def order_for(self, data_class: DataClass) -> list[Provider]:
        allowed = [p for p in self.providers if data_class == "public" or p.allows_user_content]
        pref = ["gemini", "groq", "anthropic"] if data_class == "public" else ["groq", "anthropic"]
        return sorted(allowed, key=lambda p: pref.index(p.name) if p.name in pref else 99)

    @property
    def configured(self) -> bool:
        return self.s.llm_mode == "replay" or (self.s.llm_mode == "live" and bool(self.providers))

    # ---- quotas, budget and breaker (Redis) ----------------------------------------------

    async def _available(
        self, p: Provider, data_class: DataClass = "user", max_tokens: int = 0
    ) -> bool:
        if await self.redis.exists(f"llm:cool:{p.name}"):
            return False
        cap = self._daily_cap.get(p.name)
        if cap is not None:
            used = int(await self.redis.get(f"llm:req:{ist_day()}:{p.name}") or 0)
            if used >= cap:
                return False
        tcap = self._token_cap.get(p.name)
        if tcap:
            used_t = int(await self.redis.get(f"llm:tok:{ist_day()}:{p.name}") or 0)
            # Public filings may only use a share of Groq so user checks always have headroom.
            limit = tcap * self.s.groq_public_token_share if data_class == "public" else tcap
            if used_t + max_tokens >= limit:
                return False
        if p.name == "anthropic":
            spent_paise = int(await self.redis.get(f"llm:inr:{ist_day()}") or 0)
            if spent_paise >= int(self.s.llm_daily_budget_inr * 100):
                return False
        return True

    async def _record_use(self, p: Provider, result: LlmResult | None) -> None:
        day = ist_day()
        pipe = self.redis.pipeline()
        pipe.incr(f"llm:req:{day}:{p.name}")
        pipe.expire(f"llm:req:{day}:{p.name}", 60 * 60 * 26)
        if result and (result.input_tokens or result.output_tokens):
            tok = result.input_tokens + result.output_tokens
            pipe.incrby(f"llm:tok:{day}:{p.name}", tok)
            pipe.expire(f"llm:tok:{day}:{p.name}", 60 * 60 * 26)
        if result and result.cost_inr:
            pipe.incrby(f"llm:inr:{day}", max(1, round(result.cost_inr * 100)))
            pipe.expire(f"llm:inr:{day}", 60 * 60 * 26)
        await pipe.execute()

    async def _trip(self, p: Provider, err: ProviderError) -> None:
        if err.retry_after_s:
            await self.redis.set(f"llm:cool:{p.name}", "1", ex=int(min(err.retry_after_s, 300)))
            return
        fails = await self.redis.incr(f"llm:fail:{p.name}")
        await self.redis.expire(f"llm:fail:{p.name}", 120)
        if fails >= 3:  # three failures in two minutes -> open the breaker for a minute
            await self.redis.set(f"llm:cool:{p.name}", "1", ex=60)

    # ---- the call ------------------------------------------------------------------------

    async def json(
        self,
        purpose: str,
        system: str,
        user: str,
        schema: dict,
        *,
        data_class: DataClass,
        max_tokens: int = 2000,
        ref: str | None = None,
    ) -> LlmResult:
        if self.s.llm_mode == "off":
            raise LlmUnavailable("LLM disabled")
        if self.s.llm_mode == "replay":
            return self._replay(purpose, system, user)

        last: Exception | None = None
        for p in self.order_for(data_class):
            if not await self._available(p, data_class, max_tokens):
                continue
            started = time.perf_counter()
            try:
                result = await p.complete_json(system, user, schema, purpose, max_tokens)
            except Refusal as exc:
                await self._record_use(p, None)
                await self._write_log(p, purpose, "refusal", ref, started)
                raise LlmUnavailable("refused") from exc
            except ProviderError as exc:
                last = exc
                await self._record_use(p, None)
                await self._trip(p, exc)
                await self._write_log(p, purpose, "error", ref, started)
                logger.warning(
                    "llm provider failed", extra=log_extra(provider=p.name, err=str(exc))
                )
                continue
            await self._record_use(p, result)
            await self.redis.delete(f"llm:fail:{p.name}")
            if self._log:
                await self._log(result, purpose, "ok", ref)
            if self.s.env == "dev" and FIXTURE_DIR.exists() and _recording():
                self._record_fixture(purpose, system, user, result)
            return result
        raise LlmUnavailable(str(last) if last else "no provider available")

    async def _write_log(
        self, p: Provider, purpose: str, status: str, ref: str | None, started: float
    ) -> None:
        if self._log:
            latency = int((time.perf_counter() - started) * 1000)
            await self._log(
                LlmResult(data={}, provider=p.name, model=p.model, latency_ms=latency),
                purpose,
                status,
                ref,
            )

    def _replay(self, purpose: str, system: str, user: str) -> LlmResult:
        path = FIXTURE_DIR / f"{purpose}-{fixture_key(purpose, system, user)}.json"
        if not path.exists():
            raise LlmUnavailable(f"no recording {path.name}")
        rec = json.loads(path.read_text(encoding="utf-8"))
        return LlmResult(data=rec["data"], provider=rec.get("provider", "replay"), model="replay")

    def _record_fixture(self, purpose: str, system: str, user: str, r: LlmResult) -> None:
        path = FIXTURE_DIR / f"{purpose}-{fixture_key(purpose, system, user)}.json"
        path.write_text(
            json.dumps({"provider": r.provider, "model": r.model, "data": r.data}, indent=1),
            encoding="utf-8",
        )

    async def usage_today(self) -> dict[str, object]:
        day = ist_day()
        out: dict[str, object] = {}
        for p in self.providers:
            out[p.name] = {
                "requests": int(await self.redis.get(f"llm:req:{day}:{p.name}") or 0),
                "cap": self._daily_cap.get(p.name),
                "tokens": int(await self.redis.get(f"llm:tok:{day}:{p.name}") or 0),
                "tokenCap": self._token_cap.get(p.name),
                "cooling": bool(await self.redis.exists(f"llm:cool:{p.name}")),
            }
        out["claude_inr_today"] = int(await self.redis.get(f"llm:inr:{day}") or 0) / 100
        return out


def _recording() -> bool:
    import os

    return os.environ.get("LLM_RECORD") == "1"


_router: LlmRouter | None = None


def get_router(redis: Redis) -> LlmRouter:
    global _router
    if _router is None:
        from app.llm.calllog import log_call

        _router = LlmRouter(get_settings(), redis, call_log=log_call)
    return _router
