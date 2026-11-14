"use client";

import { useState } from "react";
import { karat } from "@/lib/engine/karat";
import type { Claim, Judgment, Signal, SourceTier } from "@/lib/engine/types";
import { KaratMeter } from "./karat-meter";
import { Chip, RISK } from "./meta";
import { riskBand } from "@/lib/engine/karat";

function Stepper({ label, value, set, min = 0, max = 5 }: { label: string; value: number; set: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[0.92rem] text-paper">{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" onClick={() => set(Math.max(min, value - 1))} className="grid size-8 place-items-center rounded-lg border border-line text-paper-dim hover:border-gold/50" aria-label={`Fewer: ${label}`}>
          −
        </button>
        <output className="w-8 text-center font-mono text-paper" aria-live="polite">
          {value}
        </output>
        <button type="button" onClick={() => set(Math.min(max, value + 1))} className="grid size-8 place-items-center rounded-lg border border-line text-paper-dim hover:border-gold/50" aria-label={`More: ${label}`}>
          +
        </button>
      </span>
    </div>
  );
}

/** Runs the exact production Karat function on inputs you choose. */
export function KaratCalculator() {
  const [sup, setSup] = useState(2);
  const [con, setCon] = useState(0);
  const [unv, setUnv] = useState(0);
  const [tier, setTier] = useState<SourceTier>(1);
  const [origin, setOrigin] = useState<"filing" | "tier1_news" | "unknown">("unknown");
  const [hedges, setHedges] = useState(0);
  const [med, setMed] = useState(0);
  const [sev, setSev] = useState(0);

  const claims: Claim[] = [];
  const judgments: Judgment[] = [];
  const add = (label: Judgment["label"], n: number) => {
    for (let i = 0; i < n; i++) {
      const id = `${label}${i}`;
      claims.push({ id, text: "", kind: "corporate_event", numbers: [], hedging: claims.length < hedges, attribution: "named", checkable: true });
      judgments.push({ claimId: id, label, reason: "", grounded: true, confidence: 1, doc: label === "unverified" ? undefined : { id, source: "", tier, title: "", publishedAt: "", url: "" } });
    }
  };
  add("supported", sup);
  add("conflicting", con);
  add("unverified", unv);
  for (let i = claims.length; i < hedges; i++) claims.push({ id: `h${i}`, text: "", kind: "other", numbers: [], hedging: true, attribution: "named", checkable: false });
  const signals: Signal[] = [
    ...Array.from({ length: med }, () => ({ id: "urgency" as const, severity: "medium" as const, title: "", detail: "" })),
    ...Array.from({ length: sev }, () => ({ id: "guaranteed_returns" as const, severity: "severe" as const, title: "", detail: "" })),
  ];
  const r = karat({ claims, judgments, signals, origin });
  const band = RISK[riskBand({ claims, judgments, signals })];

  return (
    <div className="glass grid gap-8 rounded-[2rem] p-6 md:grid-cols-[1fr_auto] md:p-8">
      <div className="grid gap-x-10 sm:grid-cols-2">
        <div className="divide-y divide-line">
          <Stepper label="Supported claims" value={sup} set={setSup} />
          <Stepper label="Conflicting claims" value={con} set={setCon} />
          <Stepper label="Unverified claims" value={unv} set={setUnv} />
          <Stepper label="Hedged or unattributed" value={hedges} set={setHedges} />
        </div>
        <div className="divide-y divide-line">
          <Stepper label="Medium scam signals" value={med} set={setMed} />
          <Stepper label="Severe scam signals" value={sev} set={setSev} max={3} />
          <label className="flex items-center justify-between gap-3 py-2.5 text-[0.92rem] text-paper">
            Evidence tier
            <select value={tier} onChange={(e) => setTier(Number(e.target.value) as SourceTier)} className="rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-paper">
              <option value={1}>1 · Filing</option>
              <option value={2}>2 · Regulator</option>
              <option value={3}>3 · Tier-1 news</option>
              <option value={4}>4 · Other</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 py-2.5 text-[0.92rem] text-paper">
            Message origin
            <select value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)} className="rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-paper">
              <option value="filing">Filing / regulator</option>
              <option value="tier1_news">Tier-1 news</option>
              <option value="unknown">Unknown forward</option>
            </select>
          </label>
        </div>
      </div>
      <div className="flex flex-col items-center gap-3">
        <KaratMeter value={r.karat} size={190} />
        <Chip color={band.color} Icon={band.Icon}>
          {band.label}
        </Chip>
        <p className="font-mono text-[0.75rem] text-paper-dim">
          12 {r.parts.evidence >= 0 ? "+" : "−"} {Math.abs(r.parts.evidence)} {r.parts.source >= 0 ? "+" : "−"} {Math.abs(r.parts.source)} − {Math.abs(r.parts.language)} − {Math.abs(r.parts.scam)}
        </p>
        {r.parts.capped && <p className="max-w-[14rem] text-center text-[0.72rem] text-mute">Capped at 23: 24 needs every checkable claim supported by a tier 1–2 source.</p>}
      </div>
    </div>
  );
}
