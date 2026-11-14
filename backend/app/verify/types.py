"""Verdict schema. Serialises to the camelCase JSON the web app already renders
(apps/web/src/lib/engine/types.ts), so the UI doesn't change when it moves to this API."""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

Severity = Literal["severe", "medium", "info"]
ClaimKind = Literal["corporate_event", "return_promise", "price_call", "registration", "other"]
ClaimLabel = Literal["supported", "conflicting", "unverified"]
RiskBand = Literal["high", "elevated", "low"]
InputKind = Literal["text", "link", "image"]
SourceTier = Literal[1, 2, 3, 4]
Origin = Literal["filing", "tier1_news", "unknown"]


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def dump(self) -> dict:
        return self.model_dump(by_alias=True, exclude_none=True, mode="json")


class EvidenceRef(Camel):
    label: str
    url: str


class Signal(Camel):
    id: str
    severity: Severity
    title: str
    detail: str
    span: str | None = None
    evidence: EvidenceRef | None = None


class Entity(Camel):
    symbol: str
    name: str
    exchange: str = "NSE"
    sector: str = ""
    group: str | None = None
    sme: bool | None = None
    surveillance: str | None = None
    spike: str | None = None
    instrument_id: int | None = None


class Claim(Camel):
    id: str
    text: str
    kind: ClaimKind
    subject: Entity | None = None
    numbers: list[float] = []
    hedging: bool = False
    attribution: Literal["named", "anonymous", "none"] = "none"
    checkable: bool = False


class DocRef(Camel):
    id: str
    source: str
    tier: SourceTier
    title: str
    published_at: str
    url: str


class EvidenceDoc(DocRef):
    """A retrieved chunk with its parent document metadata."""

    symbol: str | None = None
    text: str
    kind: str | None = None
    denies: bool = False


class Judgment(Camel):
    claim_id: str
    label: ClaimLabel
    reason: str
    quote: str | None = None
    doc: DocRef | None = None
    grounded: bool
    confidence: float
    engine: Literal["rules", "llm"] = "rules"


class KaratParts(Camel):
    base: int
    evidence: float
    source: int
    language: int
    scam: int
    capped: bool


class Trail(Camel):
    count: int
    variants: int
    first_seen_days_ago: int
    channels: list[str] = []


class Disclosure(Camel):
    date: str
    kind: str
    party: str
    detail: str
    source: str
    url: str


class InputInfo(Camel):
    kind: InputKind
    redacted: str
    pii_removed: int


class Verdict(Camel):
    version: str
    input: InputInfo
    signals: list[Signal]
    claims: list[Claim]
    judgments: list[Judgment]
    karat: int
    karat_parts: KaratParts
    risk: RiskBand
    trail: Trail | None
    other_side: list[Disclosure]
    entities: list[Entity]
    summary: str
    # "assay" = LLM + records; "records-only" = rules + records when AI is paused.
    mode: Literal["assay", "records-only", "rules-preview"]
