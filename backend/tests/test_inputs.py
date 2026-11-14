"""Parakh link and screenshot inputs: SSRF guard, page extraction, vision transcription."""

import json

import httpx
import pytest

from app.ingest import linkread
from app.ingest.linkread import LinkRefused, as_check_text, check_url, extract_html, read_link
from app.llm import vision


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/admin",
        "http://localhost:8000/v1/admin/ops",
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata
        "http://10.0.0.5/",
        "http://[::1]/",
        "ftp://example.com/x",
        "https://example.com:8443/",
        "https://user:pw@example.com/",
    ],
)
async def test_ssrf_guard_refuses_private_and_odd_urls(url: str) -> None:
    with pytest.raises(LinkRefused):
        await check_url(url)


def test_extract_html_prefers_meta_and_article() -> None:
    html = """<html><head><title>T</title><meta property="og:title" content="Kaveri wins order">
    <meta name="description" content="Kaveri Power announces a Rs 420 crore order.">
    <script>evil()</script></head><body><nav>menu menu menu menu menu menu menu</nav>
    <article><p>The company said the order is worth Rs 420 crore and runs for two years.</p></article></body></html>"""
    title, text = extract_html(html)
    assert title == "Kaveri wins order"
    assert "420 crore" in text and "evil" not in text and "menu" not in text


async def test_read_link_follows_safe_redirect_and_reads_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def ok(url: str) -> str:
        return url if url.startswith("http") else f"https://{url}"

    monkeypatch.setattr(linkread, "check_url", ok)

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.host == "bit.ly":
            return httpx.Response(301, headers={"location": "https://news.example.in/story"})
        return httpx.Response(200, headers={"content-type": "text/html"},
                              html="<title>Story</title><p>SEBI barred the promoter from the market for two years today.</p>")  # fmt: skip

    link = await read_link("https://bit.ly/abc", transport=httpx.MockTransport(handler))
    out = as_check_text(link)
    assert out.startswith("https://bit.ly/abc") and "SEBI barred" in out


async def test_read_link_refuses_files(monkeypatch: pytest.MonkeyPatch) -> None:
    async def ok(url: str) -> str:
        return url

    monkeypatch.setattr(linkread, "check_url", ok)
    t = httpx.MockTransport(
        lambda r: httpx.Response(
            200, headers={"content-type": "application/vnd.android.package-archive"}, content=b"x"
        )
    )
    with pytest.raises(LinkRefused):
        await read_link("https://example.com/app.apk", transport=t)


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def test_vision_transcribes_and_strips_reasoning(
    fake_redis, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    s = get_settings()
    monkeypatch.setattr(s, "llm_mode", "live")
    monkeypatch.setattr(s, "groq_api_key", __import__("pydantic").SecretStr("k"))
    seen: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen.update(json.loads(req.content))
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": "<think>hmm</think>\nBuy XYZ now, 40% guaranteed"}}
                ]
            },
        )

    text = await vision.transcribe(fake_redis, PNG, transport=httpx.MockTransport(handler))
    assert text == "Buy XYZ now, 40% guaranteed"
    assert seen["model"] == s.groq_vision_model
    assert seen["messages"][0]["content"][1]["image_url"]["url"].startswith(
        "data:image/png;base64,"
    )


async def test_vision_rejects_non_images(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    s = get_settings()
    monkeypatch.setattr(s, "llm_mode", "live")
    monkeypatch.setattr(s, "groq_api_key", __import__("pydantic").SecretStr("k"))
    with pytest.raises(ValueError):
        await vision.transcribe(fake_redis, b"%PDF-1.7 not an image")


def test_push_material_and_quiet_hours() -> None:
    from datetime import datetime
    from types import SimpleNamespace

    from app.alerts.push import IST, generate_vapid, is_material, quiet_now

    doc = SimpleNamespace(
        tier=1, denies=False, title="Resignation of Statutory Auditor", category=""
    )
    assert is_material(doc)  # type: ignore[arg-type]
    assert not is_material(
        SimpleNamespace(tier=1, denies=False, title="Newspaper publication", category="")
    )  # type: ignore[arg-type]
    assert not is_material(
        SimpleNamespace(tier=4, denies=False, title="Auditor resigns, says blog", category="")
    )  # type: ignore[arg-type]
    assert is_material(
        SimpleNamespace(tier=1, denies=True, title="Clarification on news item", category="")
    )  # type: ignore[arg-type]
    assert quiet_now(datetime(2026, 11, 14, 23, 30, tzinfo=IST))
    assert not quiet_now(datetime(2026, 11, 14, 11, 0, tzinfo=IST))
    pub, priv = generate_vapid()
    assert len(pub) == 87 and len(priv) == 43  # 65-byte point, 32-byte scalar, base64url


async def test_pipeline_supervisor_restarts_crashed_loop() -> None:
    import asyncio

    from app.pipeline.service import supervise

    calls = {"n": 0}

    async def flaky() -> None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionError("the database system is shutting down")

    await asyncio.wait_for(supervise("t", flaky, asyncio.Event(), base_delay=0.01), timeout=5)
    assert calls["n"] == 2


def test_blocking_reads_outlast_their_block_time():
    """A 2 s socket timeout under a 15 s XREAD BLOCK killed every slow check's SSE stream."""
    from app.api.routes.checks import HEARTBEAT_MS
    from app.core import redis as redis_mod
    from app.core.redis import MAX_BLOCK_MS, get_blocking_redis
    from app.pipeline.service import consume_loop  # noqa: F401  (uses BLOCK 5000)

    redis_mod._blocking = None  # build the real client config (no connection is made)
    timeout = get_blocking_redis().connection_pool.connection_kwargs["socket_timeout"]
    redis_mod._blocking = None
    assert HEARTBEAT_MS <= MAX_BLOCK_MS
    assert timeout * 1000 > MAX_BLOCK_MS
