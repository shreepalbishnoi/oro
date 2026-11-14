"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { inr, pct } from "@/lib/room/compute";
import { call, type ShockOut } from "@/lib/room/live";
import { LiveError, RoomSkeleton } from "./mode";
import { NeedHoldings, useLiveXray } from "./live-xray";

type Opt = { kind: "company" | "group" | "sector"; target: string; label: string };

/** Live shock simulator: the arithmetic runs on the API against your real exposure. */
/** Heading for the what-if slider, which sits at the bottom of X-ray. */
export function WhatIfHead() {
  return (
    <header id="what-if" className="mb-5 scroll-mt-32">
      <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] leading-tight">What if a group or industry falls?</h2>
      <p className="mt-2 max-w-2xl text-paper-dim">Pick anything your money is in and drag the slider. It adds up your shares and your funds&rsquo; slices. Arithmetic, not a forecast.</p>
    </header>
  );
}

export function LiveShock() {
  const id = useId();
  const { me, x } = useLiveXray();
  const options = useMemo<Opt[]>(() => {
    if (!x.data) return [];
    const g = x.data.groups.filter((r) => !["Independent", "No group"].includes(r.name)).map((r) => ({ kind: "group" as const, target: r.name, label: `${r.name} group` }));
    const s = x.data.sectors.filter((r) => r.name !== "Other").map((r) => ({ kind: "sector" as const, target: r.name, label: `${r.name} (industry)` }));
    const c = x.data.exposures.slice(0, 30).map((e) => ({ kind: "company" as const, target: e.symbol ?? String(e.instrumentId), label: e.name }));
    return [...g, ...s, ...c];
  }, [x.data]);
  const [sel, setSel] = useState(0);
  const [p, setP] = useState(-10);
  const [r, setR] = useState<ShockOut | null>(null);
  const opt = options[sel];

  useEffect(() => {
    if (!opt) return;
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      call<ShockOut>("/room/shock", { method: "POST", json: { kind: opt.kind, target: opt.target, pct: p }, signal: ac.signal })
        .then(setR)
        .catch(() => undefined);
    }, 120);
    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [opt, p]);

  if (me.error) return <LiveError title={me.error.title} detail={me.error.detail} onRetry={me.reload} />;
  if (me.data && !me.data.consents.portfolio_analysis) return <NeedHoldings what="The what-if slider" />;
  if (x.error) return <LiveError title={x.error.title} detail={x.error.detail} onRetry={x.reload} />;
  if (!x.data) return <RoomSkeleton />;
  if (!options.length) return <NeedHoldings what="The what-if slider" />;
  const tone = (v: number) => (v < 0 ? "var(--red)" : v > 0 ? "var(--green)" : "var(--paper)");

  return (
    <>
      <WhatIfHead />
      <div className="glass space-y-6 rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block min-w-0 flex-1" htmlFor={`${id}-t`}>
            <span className="eyebrow">If this moves</span>
            <select id={`${id}-t`} value={sel} onChange={(e) => setSel(Number(e.target.value))} className="mt-2 block w-full rounded-xl border border-line bg-ink-2 px-3 py-2.5 text-paper focus:border-gold focus:outline-none">
              {options.map((o, i) => (
                <option key={`${o.kind}${o.target}`} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-full sm:w-72" htmlFor={`${id}-p`}>
            <span className="eyebrow">By {p > 0 ? `+${p}` : p}%</span>
            <input id={`${id}-p`} type="range" min={-50} max={50} step={1} value={p} onChange={(e) => setP(Number(e.target.value))} className="mt-3 block w-full accent-[var(--gold)]" />
          </label>
        </div>
        <div aria-live="polite">
          <p className="eyebrow">Your portfolio changes by</p>
          <p className="display mt-2 text-[clamp(2.4rem,6vw,4rem)] tabular" style={{ color: tone(r?.changeInr ?? 0) }}>
            {r ? inr(r.changeInr, { sign: true }) : "…"}
          </p>
          {r && (
            <p className="mt-1 text-paper-dim">
              {pct(r.changeShareOfNetWorth, 2)} of your net worth, on {inr(r.exposedInr)} exposed.
            </p>
          )}
        </div>
        {r && r.companies.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 text-[0.78rem]">
            {r.companies.slice(0, 12).map((c) => (
              <li key={c.name} className="rounded-full border border-line bg-ink-2 px-2.5 py-1 text-paper-dim">
                {c.name} {inr(c.exposedInr, { compact: true })}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[0.75rem] text-mute">This is arithmetic on your current exposure, not a forecast or advice.</p>
      </div>
    </>
  );
}
