"""LLM providers behind one interface: `complete_json(system, user, schema) -> LlmResult`.

- Groq and Gemini expose OpenAI-style chat endpoints; called directly with httpx (no SDK).
- Claude uses the official Anthropic SDK with `output_config.format` structured output.
"""

import json
import time
from dataclasses import dataclass, field

import httpx

from app.core.config import Settings


class ProviderError(Exception):
    def __init__(self, provider: str, msg: str, *, retry_after_s: float | None = None) -> None:
        super().__init__(f"{provider}: {msg}")
        self.provider = provider
        self.retry_after_s = retry_after_s


class Refusal(ProviderError):
    """The model declined. Not retried on another provider for the same content."""


@dataclass
class LlmResult:
    data: dict
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    latency_ms: int = 0
    cost_inr: float = 0.0
    extra: dict = field(default_factory=dict)


class Provider:
    name: str
    model: str
    # Which data classes this provider may receive (PLAN §2.3).
    allows_user_content: bool

    async def complete_json(
        self, system: str, user: str, schema: dict, schema_name: str, max_tokens: int
    ) -> LlmResult:
        raise NotImplementedError


def _retry_after(resp: httpx.Response) -> float | None:
    raw = resp.headers.get("retry-after")
    try:
        return float(raw) if raw else None
    except ValueError:
        return None


class OpenAIStyleProvider(Provider):
    """Groq and Gemini (OpenAI-compatible chat completions with strict JSON schema)."""

    def __init__(
        self,
        name: str,
        base_url: str,
        api_key: str,
        model: str,
        *,
        allows_user_content: bool,
        timeout_s: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.name, self.model = name, model
        self.allows_user_content = allows_user_content
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout_s,
            transport=transport,
        )

    async def complete_json(
        self, system: str, user: str, schema: dict, schema_name: str, max_tokens: int
    ) -> LlmResult:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_completion_tokens": max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        }
        if self.name == "groq" and self.model.startswith("openai/gpt-oss"):
            body["reasoning_effort"] = "low"  # extraction/judging don't need long reasoning
        started = time.perf_counter()
        try:
            resp = await self._client.post("chat/completions", json=body)
        except httpx.HTTPError as exc:
            raise ProviderError(self.name, f"transport {type(exc).__name__}") from exc
        latency = int((time.perf_counter() - started) * 1000)
        if resp.status_code == 429:
            raise ProviderError(self.name, "rate limited", retry_after_s=_retry_after(resp) or 30)
        if resp.status_code >= 400:
            raise ProviderError(self.name, f"HTTP {resp.status_code}: {resp.text[:200]}")
        payload = resp.json()
        choice = (payload.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        if msg.get("refusal"):
            raise Refusal(self.name, "refused")
        try:
            data = json.loads(msg.get("content") or "")
        except json.JSONDecodeError as exc:
            raise ProviderError(self.name, "invalid JSON output") from exc
        usage = payload.get("usage") or {}
        cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
        return LlmResult(
            data=data,
            provider=self.name,
            model=self.model,
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            cache_read_tokens=int(cached),
            latency_ms=latency,
        )

    async def aclose(self) -> None:
        await self._client.aclose()


# Claude Haiku 5.5, US$ per million tokens (prompts ≤ 100K tokens).
HAIKU_USD_PER_MTOK = {"in": 0.10, "out": 0.50, "cache_read": 0.01, "cache_write": 0.125}


class AnthropicProvider(Provider):
    """Optional paid quality tier. Only constructed when ANTHROPIC_API_KEY is set."""

    name = "anthropic"
    allows_user_content = True

    def __init__(self, settings: Settings) -> None:
        import anthropic

        assert settings.anthropic_api_key is not None
        self._anthropic = anthropic
        self.model = settings.anthropic_model
        self.usd_inr = settings.usd_inr
        self._client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key.get_secret_value(),
            timeout=settings.llm_timeout_s,
            max_retries=1,
        )

    async def complete_json(
        self, system: str, user: str, schema: dict, schema_name: str, max_tokens: int
    ) -> LlmResult:
        a = self._anthropic
        started = time.perf_counter()
        try:
            resp = await self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                # Stable system prompt first and cached; the tip goes after the breakpoint.
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user}],
                # Thinking is billed as output; extraction and judging run at low effort without it.
                thinking={"type": "disabled"},
                output_config={
                    "effort": "low",
                    "format": {"type": "json_schema", "schema": schema},
                },
            )
        except a.RateLimitError as exc:
            retry = exc.response.headers.get("retry-after")
            raise ProviderError(
                self.name, "rate limited", retry_after_s=float(retry or 30)
            ) from exc
        except a.APIStatusError as exc:
            raise ProviderError(self.name, f"HTTP {exc.status_code}") from exc
        except a.APIConnectionError as exc:
            raise ProviderError(self.name, "connection error") from exc
        latency = int((time.perf_counter() - started) * 1000)
        if resp.stop_reason == "refusal":
            raise Refusal(self.name, "refused")
        if resp.stop_reason == "max_tokens":
            raise ProviderError(self.name, "output truncated at max_tokens")
        text = next((b.text for b in resp.content if b.type == "text"), "")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ProviderError(self.name, "invalid JSON output") from exc
        u = resp.usage
        cache_read = int(getattr(u, "cache_read_input_tokens", 0) or 0)
        cache_write = int(getattr(u, "cache_creation_input_tokens", 0) or 0)
        usd = (
            u.input_tokens * HAIKU_USD_PER_MTOK["in"]
            + u.output_tokens * HAIKU_USD_PER_MTOK["out"]
            + cache_read * HAIKU_USD_PER_MTOK["cache_read"]
            + cache_write * HAIKU_USD_PER_MTOK["cache_write"]
        ) / 1_000_000
        return LlmResult(
            data=data,
            provider=self.name,
            model=self.model,
            input_tokens=u.input_tokens,
            output_tokens=u.output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            latency_ms=latency,
            cost_inr=usd * self.usd_inr,
        )

    async def aclose(self) -> None:
        await self._client.close()
