import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { HoldingsImport } from "@/components/room/holdings-import";
import { RoomTitle } from "@/components/room/room-title";
import { ACCOUNTS, AS_OF, FUNDS, HOLDINGS } from "@/lib/fixtures/room";
import { directValue, entity, fundsValue, inr, netWorth } from "@/lib/room/compute";
import { fmtDate } from "@/lib/format";
import { RoomSwitch } from "@/components/room/live/mode";
import { LiveHoldings } from "@/components/room/live/live-holdings";

export const metadata: Metadata = { title: "Holdings" };

function DemoHoldingsPage() {
  return (
    <>
      <RoomTitle icon={Wallet} eyebrow={`Holdings · as of ${AS_OF} close`} title={<>{inr(netWorth)} across {HOLDINGS.length} stocks and {FUNDS.length} funds.</>} lede={`Prices from the ${AS_OF} close and the latest fund NAVs.`} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[1.5rem] border border-line bg-ink-1/80" aria-labelledby="stocks">
          <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
            <h2 id="stocks" className="eyebrow">
              Stocks · CDSL demat
            </h2>
            <span className="font-mono text-paper">{inr(directValue)}</span>
          </div>
          <ul className="divide-y divide-line">
            {HOLDINGS.map((h) => (
              <li key={h.symbol} className="flex items-center justify-between gap-3 px-5 py-3 text-[0.9rem]">
                <span>
                  <span className="text-paper">{entity(h.symbol).name}</span>
                  <span className="block font-mono text-[0.72rem] text-mute">
                    {h.qty} × ₹{h.close.toLocaleString("en-IN", { minimumFractionDigits: 2 })} close
                  </span>
                </span>
                <span className="font-mono text-paper">{inr(h.qty * h.close)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[1.5rem] border border-line bg-ink-1/80" aria-labelledby="funds">
          <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
            <h2 id="funds" className="eyebrow">
              Mutual funds · CAMS + KFintech
            </h2>
            <span className="font-mono text-paper">{inr(fundsValue)}</span>
          </div>
          <ul className="divide-y divide-line">
            {FUNDS.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[0.9rem]">
                <span>
                  <span className="text-paper">{f.name}</span>
                  <span className="block font-mono text-[0.72rem] text-mute">
                    {f.units.toLocaleString("en-IN")} units × ₹{f.nav} NAV · {f.category}
                  </span>
                </span>
                <span className="font-mono text-paper">{inr(f.value)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-10" aria-labelledby="accounts">
        <h2 id="accounts" className="eyebrow mb-3">
          Linked statements
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ACCOUNTS.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-2xl border border-line bg-ink-1/80 p-4 text-[0.9rem]">
              <span>
                <span className="text-paper">{a.name}</span>
                <span className="block text-[0.75rem] text-mute">
                  {a.provider} · statement of {fmtDate(a.statementDate, { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </span>
              <span className="rounded-full bg-gold/10 px-2.5 py-1 text-[0.8rem] font-medium text-gold">{a.source}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.8rem] text-mute">Statements go stale. ORO reminds you monthly with step-by-step instructions to request a fresh CAS.</p>
      </section>

      <section className="mt-10" aria-labelledby="import">
        <h2 id="import" className="eyebrow mb-3">
          Add or refresh holdings
        </h2>
        <HoldingsImport />
      </section>
    </>
  );
}

/** Signed in: your Room from the API. Signed out: the fictional demo. */
export default function HoldingsPage() {
  return <RoomSwitch demo={<DemoHoldingsPage />} live={<LiveHoldings />} />;
}
