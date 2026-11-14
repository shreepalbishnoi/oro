import type { Metadata } from "next";
import { CircleCheck, CircleHelp, Radio, XCircle } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";
import { RUMOURS, type Rumour } from "@/lib/fixtures/room";
import { entity } from "@/lib/room/compute";
import { fmtDate } from "@/lib/format";
import { RoomSwitch } from "@/components/room/live/mode";
import { LiveFiltered } from "@/components/room/live/live-misc";

export const metadata: Metadata = { title: "Rumours" };

const STATE: Record<Rumour["state"], { label: string; color: string; Icon: typeof Radio }> = {
  unverified: { label: "Unverified", color: "var(--paper-dim)", Icon: CircleHelp },
  confirmed: { label: "Confirmed", color: "var(--green)", Icon: CircleCheck },
  denied: { label: "Denied", color: "var(--red)", Icon: XCircle },
  stale: { label: "Stale", color: "var(--mute)", Icon: CircleHelp },
};

function DemoRumoursPage() {
  return (
    <>
      <RoomTitle icon={Radio} eyebrow="Rumour tracker" title={<>Rumours about your companies, and what the companies said.</>} lede="When a story spreads, the exchange can ask the company to confirm or deny it. ORO tracks each rumour until the company answers, and marks it stale after 30 days of silence." />
      <ul className="space-y-4">
        {RUMOURS.map((r) => {
          const s = STATE[r.state];
          return (
            <li key={r.id} className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.8rem] font-medium text-paper-dim">
                  {entity(r.symbol).name} · first seen {fmtDate(r.firstSeen)}
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.8rem] font-medium" style={{ color: s.color, borderColor: `color-mix(in oklab, ${s.color} 40%, transparent)` }}>
                  <s.Icon className="size-3.5" aria-hidden="true" />
                  {s.label}
                </span>
              </div>
              <p className="mt-2 font-display text-[1.4rem] text-paper">“{r.summary}”</p>
              <ol className="mt-4 grid gap-2 sm:grid-cols-3">
                {(["seen", "asked", "resolved"] as const).map((step) => {
                  const st = r.steps.find((x) => x.state === step);
                  return (
                    <li key={step} className={`rounded-xl border p-3 text-[0.85rem] ${st ? "border-line bg-ink-2" : "border-dashed border-line text-mute"}`}>
                      <p className="text-[0.8rem] font-medium text-mute">{step === "seen" ? "1 · Spotted" : step === "asked" ? "2 · Exchange asks" : "3 · Company answers"}</p>
                      {st ? (
                        <>
                          <p className="mt-1 text-paper">{st.text}</p>
                          <p className="mt-0.5 font-mono text-[0.7rem] text-paper-dim">{st.at}</p>
                        </>
                      ) : (
                        <p className="mt-1">Waiting</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function RumoursPage() {
  return <RoomSwitch demo={<DemoRumoursPage />} live={<LiveFiltered kind="rumours" />} />;
}
