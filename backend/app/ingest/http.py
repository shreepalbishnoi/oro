import asyncio
import logging
import random

import httpx

from app.core.config import get_settings
from app.core.logging import log_extra

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


def make_client(**kwargs: object) -> httpx.AsyncClient:
    """Shared outbound client: browser-like UA (exchanges reject bare clients), HTTP/1.1 keep-alive."""
    settings = get_settings()
    headers = {
        "User-Agent": settings.http_user_agent,
        "Accept": "*/*",
        "Accept-Language": "en-IN,en;q=0.9",
    }
    headers.update(kwargs.pop("headers", {}) or {})  # type: ignore[arg-type]
    return httpx.AsyncClient(
        headers=headers,
        timeout=settings.http_timeout_s,
        follow_redirects=True,
        **kwargs,  # type: ignore[arg-type]
    )


async def get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    attempts: int = 4,
    base_delay_s: float = 1.0,
    **kwargs: object,
) -> httpx.Response:
    """GET with jittered exponential backoff on transient failures."""
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            resp = await client.get(url, **kwargs)  # type: ignore[arg-type]
            if resp.status_code not in RETRYABLE_STATUS:
                return resp
            last_exc = httpx.HTTPStatusError(
                f"retryable status {resp.status_code}", request=resp.request, response=resp
            )
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            last_exc = exc
        if attempt < attempts:
            delay = base_delay_s * 2 ** (attempt - 1) * (0.5 + random.random())  # noqa: S311
            logger.warning(
                "fetch retry",
                extra=log_extra(url=url, attempt=attempt, delay_s=round(delay, 2)),
            )
            await asyncio.sleep(delay)
    assert last_exc is not None
    raise last_exc
