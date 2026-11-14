"use client";

import { useId, useMemo, useState } from "react";
import { RollingNumber } from "@/components/motion/rolling-digits";
import { byKey, exposures, inr, netWorth, shock, type ShockTarget } from "@/lib/room/compute";
import { pulseField } from "@/lib/field-bus";

type Option = ShockTarget & { label: string };

/** "If this group falls 10%, your portfolio changes by ₹X." Arithmetic on exposure, not a forecast. */
export function ShockSimulator({ compact = false, onChange }: { compact?: boolean; onChange?: (t: ShockTarget, pct: number) => void }) {
  const id = useId();
  const options = useMemo<Option[]>(() => {
    const groups = byKey("group")
      .rows.filter((r) => r.name !== "Independent")
      .map((r) => ({ kind: "group" as const, key: r.name, label: r.name }));
    const sectors = byKey("sector").rows.map((r) => ({ kind: "sector" as const, key: r.name, label: `${r.name} (sector)` }));
    const companies = exposures().map((e) => ({ kind: "company" as const, key: e.symbol, label: e.name }));
    return compact ? [...groups, ...companies.slice(0, 3)] : [...groups, ...sectors, ...companies];
  }, [compact]);
  const [sel, setSel] = useState(0);
  const [p, setP] = useState(-10);
  const t = options[sel];
  const r = shock(t, p);
  const share = r.delta / netWorth;
  const tone = (v: number) => (v < 0 ? "var(--red)" : v > 0 ? "var(--green)" : "var(--paper)");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1">
          <span className="eyebrow">If this moves</span>
          <select
            value={sel}
            onChange={(e) => {
              const k = Number(e.target.value);
              setSel(k);
              onChange?.(options[k], p);
            }}
            className="mt-2 block w-full rounded-xl border border-line bg-ink-2 px-3 py-2.5 text-paper focus:border-gold focus:outline-none"
          >
            {options.map((o, k) => (
              <option key={`${o.kind}:${o.key}`} value={k}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <output htmlFor={`${id}-r`} className="display tabular text-4xl" style={{ color: tone(p) }}>
          {p > 0 ? "+" : p < 0 ? "−" : ""}
          {Math.abs(p)}%
        </output>
      </div>
      <input
        id={`${id}-r`}
        type="range"
        min={-40}
        max={40}
        step={1}
        value={p}
        onChange={(e) => {
          const v = Number(e.target.value);
          setP(v);
          onChange?.(t, v);
        }}
        onPointerUp={() => pulseField(p < 0 ? "red" : "green", 0.6)}
        className="oro-range w-full"
        aria-label={`Move ${t.label} by percent`}
      />
      <div className="rounded-2xl border border-line bg-ink-1/70 p-4">
        <p className="eyebrow">Your portfolio changes by</p>
        <p className="display mt-1 text-5xl" style={{ color: tone(r.delta) }}>
          <RollingNumber value={r.delta} format={(n) => inr(n, { sign: true })} duration={0.5} />
        </p>
        <p className="mt-2 text-[0.85rem] text-paper-dim">
          {(share * 100).toFixed(2)}% of your {inr(netWorth, { compact: true })}. You have {inr(r.base)} in {t.label.replace(" (sector)", "")}
          {r.hits.length > 1 ? ` across ${r.hits.length} companies` : ""}, directly and through funds.
        </p>
      </div>
      <p className="text-[0.75rem] text-mute">This is arithmetic on your exposure, not a forecast. Values as of last close.</p>
    </div>
  );
}
