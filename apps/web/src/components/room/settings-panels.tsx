"use client";

import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { clearLocal, readLocal, writeLocal } from "@/lib/local";

type Prefs = { push: boolean; telegram: boolean; email: boolean; threshold: "high" | "medium" | "all"; quietFrom: string; quietTo: string; digest: boolean };
const DEFAULT: Prefs = { push: true, telegram: false, email: true, threshold: "medium", quietFrom: "21:30", quietTo: "08:00", digest: true };

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-paper">{label}</p>
        {hint && <p className="text-[0.8rem] text-mute">{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-gold" : "bg-ink-4"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-paper transition-transform ${on ? "translate-x-5.5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

export function AlertSettings() {
  const [p, setP] = useState<Prefs>(DEFAULT);
  useEffect(() => {
    const id = requestAnimationFrame(() => setP(readLocal("oro.prefs", DEFAULT)));
    return () => cancelAnimationFrame(id);
  }, []);
  const set = (patch: Partial<Prefs>) => {
    const n = { ...p, ...patch };
    setP(n);
    writeLocal("oro.prefs", n);
  };
  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-line bg-ink-1/80 px-5 divide-y divide-line">
        <Toggle on={p.push} onChange={(v) => set({ push: v })} label="Web push" hint="On this device, once ORO is installed" />
        <Toggle on={p.telegram} onChange={(v) => set({ telegram: v })} label="Telegram" hint="Connect @ORO bot to receive alerts and forward tips" />
        <Toggle on={p.email} onChange={(v) => set({ email: v })} label="Email" />
        <Toggle on={p.digest} onChange={(v) => set({ digest: v })} label="Daily digest at 19:00 IST" hint="One summary instead of separate alerts" />
      </section>
      <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
        <fieldset>
          <legend className="text-paper">Interrupt me for</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ["high", "Only high severity"],
                ["medium", "Medium and high"],
                ["all", "Everything that touches my money"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className={`cursor-pointer rounded-full border px-3.5 py-2 text-[0.88rem] ${p.threshold === v ? "border-gold bg-gold/10 text-gold" : "border-line text-paper-dim"}`}>
                <input type="radio" name="th" value={v} checked={p.threshold === v} onChange={() => set({ threshold: v })} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-[0.85rem] text-paper-dim">
            Quiet from
            <input type="time" value={p.quietFrom} onChange={(e) => set({ quietFrom: e.target.value })} className="mt-1 block rounded-xl border border-line bg-ink-2 px-3 py-2 text-paper" />
          </label>
          <label className="text-[0.85rem] text-paper-dim">
            to
            <input type="time" value={p.quietTo} onChange={(e) => set({ quietTo: e.target.value })} className="mt-1 block rounded-xl border border-line bg-ink-2 px-3 py-2 text-paper" />
          </label>
          <p className="text-[0.8rem] text-mute">Severe alerts still come through. Never more than 5 pushes a day.</p>
        </div>
      </section>
    </div>
  );
}

const CONSENTS = [
  ["Portfolio analysis", "Read your statements to compute exposure and match news. Required for Room.", true],
  ["Product analytics", "Anonymous usage counts to improve ORO. Never includes portfolio data.", false],
  ["Keep original tip text", "Store the text of tips you check, so you can see them later. Off: only a fingerprint is kept.", false],
  ["Guardian sharing", "Let family guardians see risk bands of your checks.", false],
] as const;

export function ConsentSettings() {
  const [c, setC] = useState<Record<string, boolean>>(Object.fromEntries(CONSENTS.map(([k, , d]) => [k, d])));
  useEffect(() => {
    const id = requestAnimationFrame(() => setC((prev) => readLocal("oro.consent", prev)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <section className="rounded-[1.5rem] border border-line bg-ink-1/80 px-5 divide-y divide-line">
      {CONSENTS.map(([k, hint]) => (
        <Toggle
          key={k}
          label={k}
          hint={hint}
          on={c[k]}
          onChange={(v) => {
            const n = { ...c, [k]: v };
            setC(n);
            writeLocal("oro.consent", n);
          }}
        />
      ))}
      <p className="py-3 text-[0.8rem] text-mute">Withdrawing a consent takes effect immediately and is logged in your consent ledger (DPDP Act).</p>
    </section>
  );
}

export function DataSettings() {
  const [gone, setGone] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
        <Download className="size-5 text-gold" aria-hidden="true" />
        <h2 className="mt-3 text-paper">Export your data</h2>
        <p className="mt-1 text-[0.88rem] text-paper-dim">Everything ORO holds about you, as JSON: preferences, consents, saved hallmarks, imports.</p>
        <button
          type="button"
          className="btn btn-ghost mt-4 h-10 px-4 text-sm"
          onClick={() => {
            const data: Record<string, unknown> = {};
            try {
              Object.keys(localStorage)
                .filter((k) => k.startsWith("oro."))
                .forEach((k) => (data[k] = JSON.parse(localStorage.getItem(k) ?? "null")));
            } catch {
              /* ignore */
            }
            const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "oro-export.json";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Download JSON
        </button>
      </section>
      <section className="rounded-[1.5rem] border border-red/30 bg-ink-1/80 p-5">
        <Trash2 className="size-5 text-red" aria-hidden="true" />
        <h2 className="mt-3 text-paper">Delete everything</h2>
        <p className="mt-1 text-[0.88rem] text-paper-dim">Removes your account, statements-derived holdings, hallmarks and preferences. Can&rsquo;t be undone.</p>
        {gone ? (
          <p role="status" className="mt-4 text-[0.9rem] text-green">
            Deleted. Nothing about you remains in this browser.
          </p>
        ) : confirm ? (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn h-10 bg-red px-4 text-sm text-ink"
              onClick={() => {
                clearLocal();
                setGone(true);
              }}
            >
              Yes, delete
            </button>
            <button type="button" className="btn btn-ghost h-10 px-4 text-sm" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost mt-4 h-10 border-red/50 px-4 text-sm text-red hover:bg-red/10" onClick={() => setConfirm(true)}>
            Delete my data
          </button>
        )}
      </section>
    </div>
  );
}
