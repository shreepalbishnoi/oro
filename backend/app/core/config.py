from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _placeholder(value: str) -> bool:
    """Empty, or an all-x stand-in like the `xxxxx` values in .env.example."""
    v = value.strip().lower()
    return not v or set(v) == {"x"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://oro:oro@localhost:5432/oro"
    redis_url: str = "redis://localhost:6379/0"

    # JWT minted by the Next.js server (Better Auth session -> short-lived API token).
    auth_jwt_secret: SecretStr = SecretStr("dev-only-change-me-dev-only-change-me")
    auth_jwt_audience: str = "oro-api"
    auth_jwt_issuer: str = "oro-web"

    # HMAC key for hashing IPs, PANs and anonymous ids. Never reused as a JWT secret.
    hash_pepper: SecretStr = SecretStr("dev-only-pepper-change-me")
    # AES-GCM key (base64, 32 bytes) for field-level encryption of holdings quantities.
    field_key_b64: SecretStr = SecretStr("ZGV2LW9ubHktZmllbGQta2V5LWNoYW5nZS1tZS0xMjM=")

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    public_web_url: str = "http://localhost:3000"

    # Outbound HTTP identity for public data sources. Generic UA, never a personal address.
    http_user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    )
    http_timeout_s: float = 20.0

    # ---- LLM routing (PLAN §2.3). Free-first: every key is optional. ----
    # Groq: no training on inputs, no retention by default -> allowed for scrubbed user text.
    groq_api_key: SecretStr | None = None
    groq_model: str = "openai/gpt-oss-120b"
    groq_fast_model: str = "openai/gpt-oss-20b"
    groq_daily_requests: int = 950  # free plan: 1,000 requests/day for gpt-oss-120b
    groq_daily_tokens: int = 190_000  # free plan: 200K tokens/day; this is the binding limit
    groq_public_token_share: float = 0.3  # filings may use at most 30% so user checks keep headroom
    # Screenshots: Groq vision model, its own free quota (separate from the text model tokens).
    groq_vision_model: str = "qwen/qwen3.8-27b"
    groq_vision_daily_requests: int = 300
    anon_images_per_day: int = 3
    user_images_per_day: int = 15
    # Gemini free tier may be human-reviewed -> PUBLIC documents only, never user text.
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-flash-lite-latest"
    gemini_daily_requests: int = 450
    # Claude is the optional paid quality tier; unused unless a key is set.
    anthropic_api_key: SecretStr | None = None
    anthropic_model: str = "claude-haiku-5-5"
    llm_daily_budget_inr: float = 12.0
    usd_inr: float = 96.0
    # "live" calls providers; "replay" reads recorded responses (tests/CI); "off" = rules only.
    llm_mode: Literal["live", "replay", "off"] = "live"
    llm_timeout_s: float = 25.0

    # ---- Embeddings (self-hosted ONNX, free) ----
    embed_enabled: bool = True
    embed_model: str = "google/embeddinggemma-300m"
    embed_dim: int = 768
    # URL of the embedding service (one process holds the model). Empty = load in-process (dev).
    embed_url: str = ""

    # ---- Abuse protection ----
    turnstile_secret: SecretStr | None = None  # Cloudflare Turnstile; skipped when unset (dev)
    anon_checks_per_day: int = 3
    user_checks_per_day: int = 10
    anon_ask_per_day: int = 3
    ask_room_per_day: int = 8  # each answer costs ~3-5K Groq tokens of the 190K daily cap
    # Web Push (VAPID). Generate: python -m app.alerts.push
    vapid_public_key: str = ""
    vapid_private_key: SecretStr | None = None
    vapid_subject: str = ""  # mailto: or https: contact; defaults to PUBLIC_WEB_URL

    # ---- Channels ----
    telegram_bot_token: SecretStr | None = None
    telegram_webhook_secret: SecretStr | None = None

    # Admin emails (comma list) allowed on /v1/admin/*.
    admin_emails: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _secrets(self) -> "Settings":
        defaults = {
            "auth_jwt_secret": "dev-only-change-me-dev-only-change-me",
            "hash_pepper": "dev-only-pepper-change-me",
            "field_key_b64": "ZGV2LW9ubHktZmllbGQta2V5LWNoYW5nZS1tZS0xMjM=",
        }
        for name, dev_value in defaults.items():
            value = getattr(self, name).get_secret_value()
            if _placeholder(value) or value == "change-me":
                if self.env == "prod":
                    raise ValueError(f"{name.upper()} must be set in production")
                setattr(self, name, SecretStr(dev_value))
            elif self.env == "prod" and value == dev_value:
                raise ValueError(f"{name.upper()} is still the development value")
        # Blank or "xxxxx" optional keys in .env mean "not configured".
        for name in ("groq_api_key", "gemini_api_key", "anthropic_api_key", "turnstile_secret",
                     "telegram_bot_token", "telegram_webhook_secret", "vapid_private_key"):  # fmt: skip
            v = getattr(self, name)
            if v is not None and _placeholder(v.get_secret_value()):
                setattr(self, name, None)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
