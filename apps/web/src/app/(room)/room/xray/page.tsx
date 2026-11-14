import type { Metadata } from "next";
import { Suspense } from "react";
import { ScanEye } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";
import { XrayView } from "@/components/room/xray-view";
import { FUNDS } from "@/lib/fixtures/room";
import { byKey, exposures, inr, overlap, pct } from "@/lib/room/compute";
import { RoomSwitch } from "@/components/room/live/mode";
import { LiveXray } from "@/components/room/live/live-xray";
import { LiveShock, WhatIfHead } from "@/components/room/live/live-shock";
import { ShockLab } from "@/components/room/shock-lab";

export const metadata: Metadata = { title: "X-ray" };

function Bars({ title, rows, unattributed }: { title: string; rows: { name: string; inr: number; share: number }[]; unattributed: number }) {
  const max = Math.max(...rows.map((r) => r.share));
  return (
    <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
      <h2 className="eyebrow">{title}</h2>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex justify-between gap-3 text-[0.88rem]">
              <span className="text-paper">{r.name}</span>
              <span className="font-mono text-paper-dim">
                {pct(r.share)} · {inr(r.inr, { compact: true })}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-ink-3">
              <div className="h-full rounded-full bg-linear-to-r from-gold-deep to-gold" style={{ width: `${(r.share / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.75rem] text-mute">{inr(unattributed, { compact: true })} sits in fund holdings outside each fund&rsquo;s disclosed top holdings.</p>
    </section>
  );
}

function DemoXrayPage() {
  const ex = exposures();
  const ov = overlap();
  const groups = byKey("group");
  const sectors = byKey("sector");
  return (
    <>
      <RoomTitle
        icon={ScanEye}
        title={
          <>
            Where your money <span className="display-italic text-gold">really</span> goes.
          </>
        }
        lede="Your own shares plus the companies inside your mutual funds, added up company by company. Prices from the last close; fund holdings as disclosed on 31 Oct."
      />
      <section className="glass rounded-[1.75rem] p-4 sm:p-6">
        <Suspense fallback={<div className="h-[520px]" />}>
          <XrayView />
        </Suspense>
      </section>

      <section className="mt-10" aria-labelledby="true-holdings">
        <h2 id="true-holdings" className="eyebrow mb-3">
          Every company your money reaches ({ex.length})
        </h2>
        <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-ink-1/80">
          <table className="w-full min-w-[40rem] text-left text-[0.9rem]">
            <thead className="text-[0.8rem] font-medium text-mute">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-normal">Company</th>
                <th className="px-4 py-3 text-right font-normal">Direct</th>
                <th className="px-4 py-3 text-right font-normal">Through funds</th>
                <th className="px-4 py-3 text-right font-normal">Total</th>
                <th className="px-4 py-3 text-right font-normal">Of net worth</th>
              </tr>
            </thead>
            <tbody>
              {ex.map((e) => (
                <tr key={e.symbol} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <span className="text-paper">{e.name}</span>
                    <span className="block text-[0.75rem] text-mute">{e.group ?? e.sector}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-paper-dim">{e.direct ? inr(e.direct) : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-paper-dim">{e.viaFunds ? inr(e.viaFunds) : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-paper">{inr(e.total)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gold">{pct(e.share, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Bars title="By business group" rows={groups.rows} unattributed={groups.unattributed} />
        <Bars title="By sector" rows={sectors.rows} unattributed={sectors.unattributed} />
      </div>

      <section className="mt-10 rounded-[1.5rem] border border-line bg-ink-1/80 p-5" aria-labelledby="overlap">
        <h2 id="overlap" className="eyebrow">
          Fund overlap
        </h2>
        <p className="mt-2 text-[0.85rem] text-paper-dim">Share of each fund&rsquo;s portfolio held in common with the other, from disclosed top holdings.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[30rem] text-[0.85rem]">
            <thead>
              <tr>
                <th className="p-2" />
                {FUNDS.map((f) => (
                  <th key={f.id} scope="col" className="p-2 text-left font-normal text-paper-dim">
                    {f.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FUNDS.map((f, i) => (
                <tr key={f.id}>
                  <th scope="row" className="p-2 text-left font-normal text-paper-dim">
                    {f.short}
                  </th>
                  {ov[i].map((v, j) => (
                    <td key={j} className="p-1">
                      <span
                        className="block rounded-lg px-3 py-2 text-center font-mono"
                        style={{ background: i === j ? "var(--ink-3)" : `color-mix(in oklab, var(--gold) ${Math.round(v * 400)}%, var(--ink-2))`, color: i === j ? "var(--mute)" : "var(--paper)" }}
                      >
                        {i === j ? "—" : pct(v)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** Signed in: your Room from the API. Signed out: the fictional demo. */
export default function XrayPage() {
  return (
    <RoomSwitch
      demo={
        <>
          <DemoXrayPage />
          <section className="mt-16">
            <WhatIfHead />
            <ShockLab />
          </section>
        </>
      }
      live={
        <>
          <LiveXray />
          <section className="mt-16">
            <LiveShock />
          </section>
        </>
      }
    />
  );
}
