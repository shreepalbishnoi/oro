import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";

export const metadata: Metadata = { title: "Ops", robots: { index: false } };

// Illustrative targets and sample readings until M1/M2 metrics are wired (PLAN §14).
const KPIS = [
  { k: "Filing lag p95", v: "2m 41s", target: "< 3 min", ok: true },
  { k: "Verdict time p50", v: "11.2 s", target: "< 15 s", ok: true },
  { k: "Room feed p95", v: "118 ms", target: "< 150 ms", ok: true },
  { k: "LLM spend today", v: "₹7.40", target: "≤ ₹12", ok: true },
  { k: "Cache hit rate", v: "38%", target: "—", ok: true },
  { k: "Advice leaks", v: "0", target: "0", ok: true },
];
const SOURCES = [
  ["NSE announcements RSS", "1 min ago", true],
  ["BSE announcements XML", "2 min ago", true],
  ["SEBI RSS", "14 min ago", true],
  ["NSE bulk/block CSV", "18:31 today", true],
  ["ASM/GSM list", "spike pending (M1)", false],
  ["AMC disclosures", "spike pending (M4)", false],
] as const;
const SPEND = [5.1, 6.4, 7.9, 6.2, 9.8, 10.4, 7.4];

export default function OpsPage() {
  const max = 12;
  return (
    <>
      <RoomTitle icon={Activity} eyebrow="Founder ops · sample readings" title={<>Is everything fresh, cheap and honest today?</>} lede="Preview with illustrative numbers. Live values arrive with the evidence pipeline (M1) and LLM router (M2)." />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {KPIS.map((x) => (
          <div key={x.k} className="rounded-2xl border border-line bg-ink-1/80 p-4">
            <dt className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-mute">{x.k}</dt>
            <dd className="display mt-2 text-3xl text-paper">{x.v}</dd>
            <dd className="mt-1 text-[0.75rem] text-paper-dim">target {x.target}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5" aria-labelledby="spend">
          <h2 id="spend" className="eyebrow">
            LLM ₹ per day · cap ₹12
          </h2>
          <div className="mt-5 flex h-40 items-end gap-2" role="img" aria-label={`Daily spend over 7 days: ${SPEND.map((s) => `₹${s}`).join(", ")}`}>
            {SPEND.map((s, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[0.65rem] text-paper-dim">₹{s}</span>
                <span className="w-full rounded-t-md" style={{ height: `${(s / max) * 100}%`, background: s / max > 0.85 ? "var(--red)" : s / max > 0.6 ? "var(--gold)" : "var(--green)" }} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.75rem] text-mute">Guard levels: normal &lt; 60% · batch overflow 60–85% · Parakh and Plus only 85–100% · records-only at 100%.</p>
        </section>
        <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5" aria-labelledby="fresh">
          <h2 id="fresh" className="eyebrow">
            Source freshness
          </h2>
          <ul className="mt-4 divide-y divide-line text-[0.9rem]">
            {SOURCES.map(([n, t, ok]) => (
              <li key={n} className="flex justify-between gap-3 py-2.5">
                <span className="text-paper">{n}</span>
                <span className={ok ? "font-mono text-green" : "font-mono text-gold"}>
                  {ok ? "● " : "◆ "}
                  {t}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
