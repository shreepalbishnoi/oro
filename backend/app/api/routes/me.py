"""Account and DPDP rights (PLAN §12): profile, consent ledger, export, delete."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update

from app.api.deps import CurrentUser, RedisDep, SessionDep
from app.models import Check, Consent, Holding, Portfolio, User
from app.room.holdings import invalidate, load_positions

router = APIRouter(prefix="/v1", tags=["account"])

POLICY_VERSION = "2026-11-draft"
Purpose = Literal["portfolio_analysis", "alerts", "guardian_alerts", "analytics"]


class MeOut(BaseModel):
    id: int
    email: str | None
    display_name: str | None = Field(serialization_alias="displayName")
    telegram_linked: bool = Field(serialization_alias="telegramLinked")
    created_at: datetime = Field(serialization_alias="createdAt")
    consents: dict[str, bool]


async def _consents(session: SessionDep, user_id: int) -> dict[str, bool]:
    rows = await session.execute(
        select(Consent.purpose, Consent.granted)
        .where(Consent.user_id == user_id)
        .order_by(Consent.recorded_at, Consent.id)
    )
    out: dict[str, bool] = {}
    for purpose, granted in rows:
        out[purpose] = granted  # last write wins: the ledger is append-only
    return out


@router.get("/me", response_model_by_alias=True)
async def read_me(user: CurrentUser, session: SessionDep) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        telegram_linked=user.telegram_chat_id is not None,
        created_at=user.created_at,
        consents=await _consents(session, user.id),
    )


class ConsentIn(BaseModel):
    purpose: Purpose
    granted: bool


@router.post("/consents", status_code=status.HTTP_201_CREATED)
async def record_consent(
    body: ConsentIn, user: CurrentUser, session: SessionDep, redis: RedisDep
) -> dict[str, bool]:
    session.add(
        Consent(
            user_id=user.id,
            purpose=body.purpose,
            granted=body.granted,
            policy_version=POLICY_VERSION,
        )
    )
    if body.purpose == "portfolio_analysis" and not body.granted:
        # Withdrawal means we stop processing: holdings are erased, not just hidden.
        await session.execute(delete(Portfolio).where(Portfolio.user_id == user.id))
        await invalidate(redis, user.id)
        await redis.delete(f"feed:{user.id}")
    await session.commit()
    return await _consents(session, user.id)


@router.get("/me/export")
async def export_me(user: CurrentUser, session: SessionDep) -> dict:
    positions = await load_positions(session, user.id)
    checks = (
        await session.scalars(
            select(Check).where(Check.user_id == user.id).order_by(Check.created_at)
        )
    ).all()
    ledger = (
        await session.scalars(
            select(Consent).where(Consent.user_id == user.id).order_by(Consent.recorded_at)
        )
    ).all()
    return {
        "exportedAt": datetime.now(UTC).isoformat(),
        "account": {
            "email": user.email,
            "displayName": user.display_name,
            "createdAt": user.created_at.isoformat(),
        },
        "consents": [
            {
                "purpose": c.purpose,
                "granted": c.granted,
                "policyVersion": c.policy_version,
                "at": c.recorded_at.isoformat(),
            }
            for c in ledger
        ],
        "holdings": [
            {
                "account": p.portfolio_label,
                "source": p.source,
                "name": p.instrument.name,
                "isin": p.instrument.isin,
                "quantity": str(p.qty),
            }  # fmt: skip
            for p in positions
        ],
        "checks": [
            {
                "id": c.public_id,
                "at": c.created_at.isoformat(),
                "text": c.redacted_text,
                "karat": c.karat,
                "risk": c.risk,
            }
            for c in checks
        ],
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser, session: SessionDep, redis: RedisDep) -> None:
    """Erases portfolio data now; checks are detached (kept anonymised for Forward Trail counts)."""
    await session.execute(delete(Holding).where(Holding.user_id == user.id))
    await session.execute(delete(Portfolio).where(Portfolio.user_id == user.id))
    await session.execute(update(Check).where(Check.user_id == user.id).values(user_id=None))
    await session.execute(
        update(User)
        .where(User.id == user.id)
        .values(
            email=None,
            display_name=None,
            phone_e164=None,
            telegram_chat_id=None,
            auth_subject=f"deleted:{user.id}",
            deleted_at=datetime.now(UTC),
        )  # fmt: skip
    )
    await session.commit()
    await invalidate(redis, user.id)
    await redis.delete(f"feed:{user.id}", f"feed:{user.id}:read", f"feed:{user.id}:dismissed")
