import type { Metadata } from "next";
import Link from "next/link";
import { Flag } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";
import { FLAGS } from "@/lib/fixtures/room";
import { entity, exposureOf, inr } from "@/lib/room/compute";
import { fmtDate } from "@/lib/format";
import { RoomSwitch } from "@/components/room/live/mode";
import { LiveFiltered } from "@/components/room/live/live-misc";

export const metadata: Metadata = { title: "Red flags" };

const DETECTORS = ["Promoter pledge rises", "Auditor resigns", "CFO or CEO exits", "Rating cut", "SEBI order", "ASM/GSM entry", "Late results"];

function DemoFlagsPage() {
  const bySymbol = [...new Set(FLAGS.map((f) => f.symbol))];
  return (
    <>
      <RoomTitle icon={Flag} eyebrow="Red flags · governance" title={<>{FLAGS.length} red flags on {bySymbol.length} companies you hold.</>} lede="From exchange filings, surveillance lists and rating changes, as soon as they're published. A red flag is worth knowing about; it isn't a verdict on the company." />
      <div className="space-y-6">
        {bySymbol.map((sym) => {
          const e = entity(sym);
          const x = exposureOf(sym);
          const items = FLAGS.filter((f) => f.symbol === sym).sort((a, b) => b.date.localeCompare(a.date));
          return (
            <section key={sym} className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5" aria-labelledby={`f-${sym}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`f-${sym}`} className="font-display text-[1.4rem] text-paper">
                  <Link href={`/s/${sym}`} className="hover:text-gold">
                    {e.name}
                  </Link>
                </h2>
                {x && <p className="font-mono text-[0.75rem] text-paper-dim">{inr(x.total)} of yours{x.direct === 0 ? " · through funds" : ""}</p>}
              </div>
              <ol className="relative mt-5 space-y-5 border-l border-line pl-6">
                {items.map((f) => (
                  <li key={f.title} className="relative">
                    <span className="absolute top-1.5 -left-[1.78rem] size-3 rounded-full ring-4 ring-ink" style={{ background: f.severity === "high" ? "var(--red)" : "var(--gold)" }} aria-hidden="true" />
                    <p className="font-mono text-[0.72rem] text-mute">
                      {fmtDate(f.date, { day: "numeric", month: "short", year: "numeric" })} · {f.source} · <span style={{ color: f.severity === "high" ? "var(--red)" : "var(--gold)" }}>{f.severity === "high" ? "High" : "Medium"}</span>
                    </p>
                    <p className="mt-1 text-paper">{f.title}</p>
                    <p className="text-[0.88rem] text-paper-dim">{f.detail}</p>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
      <p className="mt-8 text-[0.82rem] text-mute">ORO watches for: {DETECTORS.join(", ").toLowerCase()}.</p>
    </>
  );
}

export default function FlagsPage() {
  return <RoomSwitch demo={<DemoFlagsPage />} live={<LiveFiltered kind="flags" />} />;
}
