"""Embedding client: calls the embedding service, or the in-process model in dev."""

import asyncio
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class EmbeddingUnavailable(Exception):
    pass


QUERY_TIMEOUT_S = 6.0  # a live check falls back to keyword search rather than wait
DOC_TIMEOUT_S = 180.0
REQUEST_MAX = 32  # the service accepts at most 64 texts per call


async def embed(texts: list[str], kind: str = "doc") -> list[list[float]]:
    s = get_settings()
    if not s.embed_enabled or not texts:
        raise EmbeddingUnavailable("embeddings disabled")
    if s.embed_url:
        timeout = QUERY_TIMEOUT_S if kind == "query" else DOC_TIMEOUT_S
        out: list[list[float]] = []
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=2.0)) as client:
                for i in range(0, len(texts), REQUEST_MAX):
                    resp = await client.post(
                        f"{s.embed_url}/embed",
                        json={"texts": texts[i : i + REQUEST_MAX], "kind": kind},
                    )
                    resp.raise_for_status()
                    out += resp.json()["vectors"]
            return out
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise EmbeddingUnavailable(f"{type(exc).__name__}: {exc}") from exc
    from app.embed.model import embed_texts

    try:
        return await asyncio.to_thread(embed_texts, texts, kind)
    except Exception as exc:  # noqa: BLE001 - model download or runtime failure
        logger.warning("in-process embedding failed: %s", type(exc).__name__)
        raise EmbeddingUnavailable(str(exc)) from exc
