from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LlmCall(Base):
    """One row per LLM request; source of truth for the ₹ budget and cache-hit reporting."""

    __tablename__ = "llm_calls"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    purpose: Mapped[str] = mapped_column(String(48), nullable=False)  # extract | judge | tip_ocr
    provider: Mapped[str] = mapped_column(String(24), nullable=False, default="anthropic")
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="ok"
    )  # ok|error|refusal
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    batched: Mapped[bool] = mapped_column(nullable=False, default=False)
    cost_inr: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    ref: Mapped[str | None] = mapped_column(String(64))  # document/tip id for tracing
