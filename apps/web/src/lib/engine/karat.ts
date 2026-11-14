/**
 * Karat (0–24) and risk band, exactly as published in PLAN §9.2 and /methodology.
 * Deterministic; versioned so a verdict can always be recomputed.
 */
import type { Claim, Judgment, KaratParts, RiskBand, Signal, SourceTier } from "./types";

export const KARAT_VERSION = "karat-0.1";

const TIER_WEIGHT: Record<SourceTier, number> = { 1: 1, 2: 1, 3: 0.7, 4: 0.4 };

export type Origin = "filing" | "tier1_news" | "unknown";

export function karat(input: { claims: Claim[]; judgments: Judgment[]; signals: Signal[]; origin: Origin }): { karat: number; parts: KaratParts } {
  const { claims, judgments, signals, origin } = input;
  const base = 12;

  let ev = 0;
  for (const j of judgments) {
    const w = j.doc ? TIER_WEIGHT[j.doc.tier] : 1;
    if (j.label === "supported") ev += 3 * w;
    if (j.label === "conflicting") ev -= 5 * w;
  }
  const evidence = Math.max(-9, Math.min(9, ev));

  const source = origin === "filing" ? 3 : origin === "tier1_news" ? 0 : -3;

  let lang = 0;
  for (const c of claims) {
    if (c.hedging) lang -= 1;
    if (c.attribution !== "named") lang -= 1;
  }
  const language = Math.max(-3, lang);

  let scam = 0;
  for (const s of signals) {
    if (s.severity === "medium") scam -= 2;
    if (s.severity === "severe") scam -= 6;
  }

  let k = Math.round(base + evidence + source + language + scam);
  k = Math.max(0, Math.min(24, k));

  // 24 only when every checkable claim is Supported by a tier 1 or 2 source.
  const checkable = claims.filter((c) => c.checkable);
  const perfect =
    checkable.length > 0 &&
    checkable.every((c) => {
      const j = judgments.find((x) => x.claimId === c.id);
      return j?.label === "supported" && j.doc && j.doc.tier <= 2;
    });
  const capped = k === 24 && !perfect;
  if (capped) k = 23;

  return { karat: k, parts: { base, evidence: Math.round(evidence * 10) / 10, source, language, scam, capped } };
}

export function riskBand(input: { claims: Claim[]; judgments: Judgment[]; signals: Signal[] }): RiskBand {
  const { claims, judgments, signals } = input;
  if (signals.some((s) => s.severity === "severe")) return "high";
  const material = new Set(claims.filter((c) => c.checkable).map((c) => c.id));
  if (judgments.some((j) => j.label === "conflicting" && material.has(j.claimId))) return "high";
  // Three different medium warnings together is the shape of a pump message.
  if (new Set(signals.filter((s) => s.severity === "medium").map((s) => s.id)).size >= 3) return "high";
  if (signals.some((s) => s.severity === "medium")) return "elevated";
  const unv = judgments.filter((j) => j.label === "unverified").length;
  if (judgments.length > 0 && unv / judgments.length > 0.5) return "elevated";
  return "low";
}
