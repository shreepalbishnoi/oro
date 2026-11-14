"""Claim extraction: LLM first (structured output), rules as the always-available fallback."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.prompts import EXTRACT_SCHEMA, EXTRACT_SYSTEM
from app.llm.router import LlmRouter, LlmUnavailable
from app.verify.claims import extract_claims_rules
from app.verify.entities import link_entities
from app.verify.scrub import scrub
from app.verify.types import Claim, Entity

MAX_CLAIMS = 5


async def _resolve_subject(
    session: AsyncSession,
    company: str | None,
    symbol: str | None,
    entities: list[Entity],
) -> Entity | None:
    """Map the model's company/symbol to a real instrument. Never trust a symbol blindly."""
    for e in entities:
        if symbol and e.symbol.upper() == symbol.upper():
            return e
    if company:
        low = company.lower()
        for e in entities:
            if low in e.name.lower() or e.name.lower() in low:
                return e
        found, _ = await link_entities(session, company, limit=1)
        if found:
            entities.append(found[0])
            return found[0]
    if symbol:
        found, _ = await link_entities(session, symbol.upper(), limit=1)
        if found and found[0].symbol.upper() == symbol.upper():
            entities.append(found[0])
            return found[0]
    return None


async def extract_claims(
    session: AsyncSession,
    router: LlmRouter | None,
    redacted: str,
    entities: list[Entity],
    aliases: dict[str, set[str]],
    ref: str,
) -> tuple[list[Claim], bool]:
    """Returns (claims, used_llm). `redacted` is already PII-scrubbed."""
    if router is not None and router.configured:
        try:
            result = await router.json(
                "extract",
                EXTRACT_SYSTEM,
                f"<tip>\n{redacted}\n</tip>",
                EXTRACT_SCHEMA,
                data_class="user",
                max_tokens=1200,
                ref=ref,
            )
            claims: list[Claim] = []
            for raw in result.data.get("claims", [])[:MAX_CLAIMS]:
                kind = raw.get("kind", "other")
                subject = None
                if kind in ("corporate_event", "price_call"):
                    subject = await _resolve_subject(
                        session, raw.get("company"), raw.get("symbol"), entities
                    )
                text = scrub(str(raw.get("text", "")))[0].strip()
                if not text:
                    continue
                claims.append(
                    Claim(
                        id=f"c{len(claims) + 1}",
                        text=text[:220],
                        kind=kind,
                        subject=subject,
                        numbers=[
                            float(n)
                            for n in raw.get("amounts_crore", [])
                            if isinstance(n, int | float) and n > 0
                        ][:6],
                        hedging=bool(raw.get("hedging")),
                        attribution=raw.get("attribution", "none"),
                        checkable=bool(raw.get("checkable"))
                        and kind in ("corporate_event", "registration"),
                    )
                )
            return claims, True
        except LlmUnavailable:
            pass
    return extract_claims_rules(redacted, entities, aliases, MAX_CLAIMS), False
