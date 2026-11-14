"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ScanEye } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";
import { XraySankey, type L, type N } from "@/components/room/xray-sankey";
import { inr, pct } from "@/lib/room/compute";
import { useApi, type MeOut, type Split, type XrayOut } from "@/lib/room/live";
import { LiveError, RoomSkeleton } from "./mode";

const KIND: Record<string, N["kind"]> = { user: "you", account: "account", fund: "account", company: "company" };
const COL: Record<string, number> = { user: 0, account: 1, fund: 1, company: 2 };

/** Short labels so the right-hand column fits: drop "Limited", plan suffixes, cap length. */
const short = (s: string) => {
  const t = s.replace(/\s+(limited|ltd\.?)$/i, "").replace(/\s+·\s+.*$/, "").trim();
  return t.length > 30 ? `${t.slice(0, 29)}…` : t;
};

export function toSankey(x: XrayOut): { nodes: N[]; links: L[] } {
  return {
    nodes: x.sankey.nodes.map((n) => ({ id: n.id === "co:other" ? "other" : n.id, name: short(n.label), kind: KIND[n.kind] ?? "company", col: COL[n.kind] ?? 2 })),
    links: x.sankey.links.map((l) => ({ source: l.source, target: l.target === "co:other" ? "other" : l.target, value: l.inr })),
  };
}

function Bars({ title, rows, note }: { title: string; rows: Split[]; note?: string }) {
  const max = Math.max(...rows.map((r) => r.share), 0.0001);
  return (
    <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
      <h2 className="eyebrow">{title}</h2>
      <ul className="mt-4 space-y-3">
        {rows.slice(0, 10).map((r) => (
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
      {note && <p className="mt-4 text-[0.75rem] text-mute">{note}</p>}
    </section>
  );
}

export function useLiveXray() {
  const me = useApi<MeOut>("/me");
  const x = useApi<XrayOut>(me.data?.consents.portfolio_analysis ? "/room/xray" : null);
  return { me, x };
}

export function NeedHoldings({ what }: { what: string }) {
  return (
    <div className="glass rounded-[1.75rem] p-6">
      <p className="text-paper">{what} needs your holdings.</p>
      <Link href="/room/holdings" className="btn btn-gold mt-4 h-10 px-4 text-sm">
        Import holdings
      </Link>
    </div>
  );
}

export function LiveXray() {
  const { me, x } = useLiveXray();
  const graph = useMemo(() => (x.data ? toSankey(x.data) : null), [x.data]);
  if (me.error) return <LiveError title={me.error.title} detail={me.error.detail} onRetry={me.reload} />;
  if (me.data && !me.data.consents.portfolio_analysis) return <NeedHoldings what="X-ray" />;
  if (x.error) return <LiveError title={x.error.title} detail={x.error.detail} onRetry={x.reload} />;
  if (!x.data || !graph) return <RoomSkeleton />;
  const d = x.data;
  if (!d.exposures.length) return <NeedHoldings what="X-ray" />;
  const cov = d.coverage;
  const fundsTotal = cov.fundsLookedThroughInr + cov.fundsWithoutDisclosureInr;

  return (
    <>
      <RoomTitle
        icon={ScanEye}
        eyebrow="X-ray · look-through exposure"
        title={
          <>
            Where your money <span className="display-italic text-gold">really</span> goes.
          </>
        }
        lede={`Your shares plus what your funds disclose they own, joined company by company. Values as of ${d.asOf ? new Date(d.asOf).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "last"} close.`}
      />
      <section className="glass rounded-[1.75rem] p-4 sm:p-6">
        <XraySankey height={Math.min(760, 260 + graph.nodes.length * 18)} data={graph} total={d.netWorthInr} />
      </section>

      {fundsTotal > 0 && (
        <p className="mt-4 rounded-xl border border-line bg-ink-1/70 p-3 text-[0.82rem] text-paper-dim">
          {cov.fundsLookedThroughInr > 0 ? `Looked through ${inr(cov.fundsLookedThroughInr, { compact: true })} of ${inr(fundsTotal, { compact: true })} in funds and ETFs to the companies they own. ` : ""}
          {cov.fundsWithoutDisclosureInr > 0 &&
            `${inr(cov.fundsWithoutDisclosureInr, { compact: true })} is in funds and ETFs shown as themselves: gold and silver ETFs hold metal, not companies, and equity fund portfolios load from monthly AMC disclosures.`}
        </p>
      )}

      <section className="mt-10" aria-labelledby="true-holdings">
        <h2 id="true-holdings" className="eyebrow mb-3">
          True holdings · top {Math.min(25, d.exposures.length)}
        </h2>
        <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-ink-1/80">
          <table className="w-full min-w-[40rem] text-left text-[0.9rem]">
            <thead className="text-[0.8rem] font-medium text-mute">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-normal">Company or fund</th>
                <th className="px-4 py-3 text-right font-normal">Direct</th>
                <th className="px-4 py-3 text-right font-normal">Through funds</th>
                <th className="px-4 py-3 text-right font-normal">Total</th>
                <th className="px-4 py-3 text-right font-normal">Of net worth</th>
              </tr>
            </thead>
            <tbody>
              {d.exposures.slice(0, 25).map((e) => (
                <tr key={e.instrumentId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <span className="text-paper">{e.name}</span>
                    <span className="block text-[0.75rem] text-mute">{e.group ?? e.sector ?? e.symbol ?? ""}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-paper-dim">{e.directInr ? inr(e.directInr) : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-paper-dim">{e.viaFundsInr ? inr(e.viaFundsInr) : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-paper">{inr(e.totalInr)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gold">{pct(e.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <Bars title="By business group" rows={d.groups} note="Groups come from a curated map of large Indian business houses; everything else, including funds and ETFs, is Independent." />
        <Bars title="By industry" rows={d.sectors} />
      </div>

      {d.overlap.length > 0 && (
        <section className="mt-10 rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
          <h2 className="eyebrow">Fund overlap</h2>
          <ul className="mt-4 divide-y divide-line">
            {d.overlap.slice(0, 8).map((o) => (
              <li key={`${o.a}${o.b}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[0.88rem]">
                <span className="text-paper">
                  {o.a} <span className="text-mute">and</span> {o.b}
                </span>
                <span className="font-mono text-paper-dim">
                  {pct(o.overlap)} overlap · {o.common} shared holdings
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
