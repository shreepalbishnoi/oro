"""Persists one `llm_calls` row per provider attempt (cost, tokens, latency, outcome)."""

import logging
from decimal import Decimal

from app.db.session import get_sessionmaker
from app.llm.providers import LlmResult
from app.models import LlmCall

logger = logging.getLogger(__name__)


async def log_call(r: LlmResult, purpose: str, status: str, ref: str | None) -> None:
    try:
        async with get_sessionmaker()() as session:
            session.add(
                LlmCall(
                    purpose=purpose[:48],
                    provider=r.provider[:24],
                    model=r.model[:64],
                    status=status,
                    input_tokens=r.input_tokens,
                    output_tokens=r.output_tokens,
                    cache_read_tokens=r.cache_read_tokens,
                    cache_write_tokens=r.cache_write_tokens,
                    cost_inr=Decimal(str(round(r.cost_inr, 4))),
                    latency_ms=r.latency_ms,
                    ref=(ref or "")[:64] or None,
                )
            )
            await session.commit()
    except Exception:  # noqa: BLE001 - logging must never break a check
        logger.exception("could not write llm_calls row")
