/**
 * The Parakh assay, rules-preview edition. Same stages and output schema as
 * the backend pipeline in PLAN §6.2, so the UI doesn't change when the
 * FastAPI engine replaces it.
 */
import { DISCLOSURES } from "../fixtures/market";
import { TRAIL_SEEDS } from "../fixtures/tips";
import { guard } from "./advice-filter";
import { extractClaims } from "./claims";
import { findEntities } from "./entities";
import { judge } from "./judge";
import { karat, KARAT_VERSION, riskBand, type Origin } from "./karat";
import { scrub } from "./scrub";
import { detectSignals, hostOf } from "./signals";
import { recordAndRead, seedTrail } from "./trail";
import type { AssayEvent, InputKind, Verdict } from "./types";

export const MAX_INPUT = 4000;

function originOf(text: string): Origin {
  const hosts = [...text.matchAll(/\bhttps?:\/\/[^\s]+/gi)].map((m) => hostOf(m[0]) ?? "");
  if (hosts.some((h) => /(nseindia\.com|bseindia\.com|sebi\.gov\.in)$/.test(h)) || /\b(as per|according to) (its|the) (nse|bse) filing\b/i.test(text)) return "filing";
  if (hosts.some((h) => /(economictimes\.indiatimes\.com|livemint\.com|business-standard\.com|thehindubusinessline\.com)$/.test(h))) return "tier1_news";
  return "unknown";
}

function summarise(v: Omit<Verdict, "summary">): string {
  const parts: string[] = [];
  const severe = v.signals.filter((s) => s.severity === "severe");
  const conflict = v.judgments.find((j) => j.label === "conflicting");
  const supported = v.judgments.filter((j) => j.label === "supported").length;
  if (v.risk === "high") parts.push("High risk.");
  else if (v.risk === "elevated") parts.push("Be careful.");
  else parts.push("Low risk information.");
  if (severe[0]) parts.push(`${severe[0].title}.`);
  if (conflict) parts.push(conflict.reason);
  if (supported) parts.push(`${supported} claim${supported > 1 ? "s" : ""} match${supported > 1 ? "" : "es"} exchange records.`);
  if (!conflict && !supported && v.claims.some((c) => c.checkable)) parts.push("No record confirms the main claim yet.");
  return guard(parts.join(" "));
}

export function assay(raw: string, kind: InputKind = "text", opts: { record?: boolean; now?: number } = {}): Verdict {
  seedTrail(TRAIL_SEEDS, opts.now);
  const text = raw.slice(0, MAX_INPUT);
  const { redacted, removed } = scrub(text);
  const entities = findEntities(text);
  const signals = detectSignals(text, entities);
  const claims = extractClaims(text, entities);
  const judgments = claims.map(judge);
  const { karat: k, parts } = karat({ claims, judgments, signals, origin: originOf(text) });
  const risk = riskBand({ claims, judgments, signals });
  const trail = recordAndRead(text, opts.record ?? false, opts.now);
  const otherSide = entities.flatMap((e) => DISCLOSURES[e.symbol] ?? []);
  const v = {
    version: KARAT_VERSION,
    input: { kind, redacted, piiRemoved: removed },
    signals,
    claims,
    judgments,
    karat: k,
    karatParts: parts,
    risk,
    trail,
    otherSide,
    entities,
    mode: "rules-preview" as const,
  };
  return { ...v, summary: summarise(v) };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Streams the assay stage by stage. The pauses mirror the real pipeline's latency profile. */
export async function* assayStream(raw: string, kind: InputKind, slugOf: (redacted: string) => string): AsyncGenerator<AssayEvent> {
  const v = assay(raw, kind, { record: true, now: Date.now() });
  yield { type: "stage", stage: "scrub" };
  await wait(260);
  yield { type: "scrubbed", redacted: v.input.redacted, piiRemoved: v.input.piiRemoved };
  yield { type: "stage", stage: "signals" };
  for (const s of v.signals) {
    await wait(170);
    yield { type: "signal", signal: s };
  }
  await wait(300);
  yield { type: "stage", stage: "claims" };
  await wait(420);
  yield { type: "claims", claims: v.claims };
  yield { type: "stage", stage: "evidence" };
  for (const j of v.judgments) {
    await wait(520);
    yield { type: "judgment", judgment: j };
  }
  yield { type: "trail", trail: v.trail };
  if (v.otherSide.length) yield { type: "otherSide", items: v.otherSide };
  await wait(300);
  yield { type: "stage", stage: "karat" };
  yield { type: "karat", karat: v.karat, parts: v.karatParts, risk: v.risk };
  await wait(900);
  yield { type: "stage", stage: "done" };
  yield { type: "done", verdict: v, slug: slugOf(v.input.redacted) };
}
