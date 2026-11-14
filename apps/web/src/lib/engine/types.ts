export type Severity = "severe" | "medium" | "info";

export type SignalId =
  | "guaranteed_returns"
  | "urgency"
  | "secrecy"
  | "sebi_claim"
  | "registered_promise"
  | "upi_payment"
  | "link_shortener"
  | "link_lookalike"
  | "link_idn"
  | "link_apk"
  | "private_group"
  | "fake_authority"
  | "price_call"
  | "pump_language"
  | "surveillance"
  | "sme_low_float"
  | "volume_spike"
  | "forwarded";

export type Signal = {
  id: SignalId;
  severity: Severity;
  title: string;
  detail: string;
  /** Short span from the (redacted) tip that triggered the rule. */
  span?: string;
  evidence?: { label: string; url: string };
};

export type ClaimKind = "corporate_event" | "return_promise" | "price_call" | "registration" | "other";

export type Entity = {
  symbol: string;
  name: string;
  exchange: "NSE" | "BSE" | "NSE SME" | "BSE SME";
  sector: string;
  group?: string;
  sme?: boolean;
  surveillance?: string; // e.g. "ASM Stage II"
  spike?: string; // e.g. "Volume 11× its 60-day average on 7 Nov"
};

export type Claim = {
  id: string;
  text: string;
  kind: ClaimKind;
  subject?: Entity;
  numbers: number[]; // normalised to ₹ crore where a unit was given
  hedging: boolean;
  attribution: "named" | "anonymous" | "none";
  checkable: boolean;
};

export type SourceTier = 1 | 2 | 3 | 4;

export type EvidenceDoc = {
  id: string;
  symbol: string;
  source: string; // "NSE filing", "BSE filing", "SEBI order", "Economic Times"
  tier: SourceTier;
  kind: "order_win" | "acquisition" | "dividend" | "results" | "bonus" | "clarification" | "pledge" | "merger" | "rating";
  title: string;
  text: string;
  publishedAt: string; // ISO date
  url: string;
  denies?: boolean;
};

export type ClaimLabel = "supported" | "conflicting" | "unverified";

export type Judgment = {
  claimId: string;
  label: ClaimLabel;
  reason: string;
  quote?: string;
  doc?: Pick<EvidenceDoc, "id" | "source" | "tier" | "title" | "publishedAt" | "url">;
  grounded: boolean;
  confidence: number;
};

export type KaratParts = {
  base: number;
  evidence: number;
  source: number;
  language: number;
  scam: number;
  capped: boolean;
};

export type RiskBand = "high" | "elevated" | "low";

export type Trail = { count: number; variants: number; firstSeenDaysAgo: number; channels: string[] };

export type Disclosure = {
  date: string;
  kind: "Bulk deal" | "Block deal" | "Insider sale" | "Insider purchase" | "Pledge created" | "Pledge released";
  party: string;
  detail: string;
  source: string;
  url: string;
};

export type InputKind = "text" | "link" | "image";

export type Verdict = {
  version: string;
  input: { kind: InputKind; redacted: string; piiRemoved: number };
  signals: Signal[];
  claims: Claim[];
  judgments: Judgment[];
  karat: number;
  karatParts: KaratParts;
  risk: RiskBand;
  trail: Trail | null;
  otherSide: Disclosure[];
  entities: Entity[];
  summary: string;
  /** "rules-preview" from the TS engine; "assay" or "records-only" from the API. */
  mode: "rules-preview" | "assay" | "records-only";
};

export type AssayEvent =
  | { type: "stage"; stage: "scrub" | "signals" | "claims" | "evidence" | "karat" | "done" }
  | { type: "scrubbed"; redacted: string; piiRemoved: number }
  | { type: "signal"; signal: Signal }
  | { type: "claims"; claims: Claim[] }
  | { type: "judgment"; judgment: Judgment }
  | { type: "karat"; karat: number; parts: KaratParts; risk: RiskBand }
  | { type: "trail"; trail: Trail | null }
  | { type: "otherSide"; items: Disclosure[] }
  | { type: "done"; verdict: Verdict; slug: string }
  | { type: "error"; message: string };
