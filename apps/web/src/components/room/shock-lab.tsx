"use client";

import { useState } from "react";
import { exposures, inr, type ShockTarget } from "@/lib/room/compute";
import { ShockSimulator } from "./shock-simulator";

/** Simulator + the companies it touches, whose bars shrink or grow as you drag. */
export function ShockLab() {
  const [t, setT] = useState<{ target: ShockTarget; pct: number } | null>(null);
  const ex = exposures();
  const max = Math.max(...ex.map((e) => e.total)) * 1.4;
  const hit = (sym: string) => {
    if (!t) return false;
    const e = ex.find((x) => x.symbol === sym)!;
    return t.target.kind === "company" ? e.symbol === t.target.key : t.target.kind === "group" ? e.group === t.target.key : e.sector === t.target.key;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="glass rounded-[1.75rem] p-6">
        <ShockSimulator onChange={(target, pct) => setT({ target, pct })} />
      </div>
      <section className="rounded-[1.75rem] border border-line bg-ink-1/80 p-6" aria-label="Affected holdings">
        <p className="eyebrow">Your exposure, before → after</p>
        <ul className="mt-5 space-y-3">
          {ex.map((e) => {
            const on = hit(e.symbol);
            const after = on && t ? e.total * (1 + t.pct / 100) : e.total;
            return (
              <li key={e.symbol} className={on ? "" : "opacity-40"}>
                <div className="flex justify-between text-[0.85rem]">
                  <span className="text-paper">{e.name}</span>
                  <span className="font-mono text-paper-dim">
                    {inr(e.total, { compact: true })}
                    {on && <span style={{ color: after < e.total ? "var(--red)" : "var(--green)" }}> → {inr(after, { compact: true })}</span>}
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-ink-3">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-paper/25" style={{ width: `${(e.total / max) * 100}%` }} />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${(after / max) * 100}%`, background: on ? (after < e.total ? "var(--red)" : "var(--green)") : "transparent" }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-[0.75rem] text-mute">Move the slider to see which holdings the change touches.</p>
      </section>
    </div>
  );
}
