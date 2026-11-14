"use client";

import { useId, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Plus, ShieldCheck, Trash2, Upload, Wallet } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";
import { inr } from "@/lib/room/compute";
import { ApiProblem, call, invalidateRoom, useApi, useDebounced, type HoldingsOut, type ImportResult, type InstrumentHit, type LiveHolding, type MeOut } from "@/lib/room/live";
import { LiveError, RoomSkeleton } from "./mode";

const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "no close yet");
const qtyFmt = (q: string) => Number(q).toLocaleString("en-IN", { maximumFractionDigits: 4 });

/** DPDP: Room processes holdings only after an explicit, withdrawable consent (PLAN §12). */
function ConsentGate({ onGranted }: { onGranted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="glass rounded-[1.75rem] p-6" aria-labelledby="consent-h">
      <ShieldCheck className="size-6 text-gold" aria-hidden="true" />
      <h2 id="consent-h" className="display mt-3 text-2xl">
        Before Room reads your holdings
      </h2>
      <ul className="mt-3 max-w-2xl list-disc space-y-1.5 pl-5 text-[0.92rem] text-paper-dim">
        <li>ORO uses your holdings only to value them at the last close, map what your funds own, and pick the news that reaches you.</li>
        <li>Quantities are encrypted at rest. Statements and passwords are read in memory and never stored.</li>
        <li>You can export or delete everything at any time. Withdrawing consent erases your holdings.</li>
        <li>ORO never tells you to buy, sell or hold anything.</li>
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await call("/consents", { method: "POST", json: { purpose: "portfolio_analysis", granted: true } });
            invalidateRoom();
            onGranted();
          } catch (e) {
            setErr(e instanceof ApiProblem ? (e.detail ?? e.title) : "Couldn't save your consent.");
          } finally {
            setBusy(false);
          }
        }}
        className="btn btn-gold mt-5 h-11 px-5"
      >
        I agree, set up my Room
      </button>
      {err && (
        <p role="alert" className="mt-3 text-[0.85rem] text-red">
          {err}
        </p>
      )}
    </section>
  );
}

function ImportPanel() {
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<InstrumentHit | null>(null);
  const [qty, setQty] = useState("");
  const dq = useDebounced(q.trim());
  const hits = useApi<InstrumentHit[]>(dq.length >= 2 && !pick ? `/instruments/search?q=${encodeURIComponent(dq)}&limit=8` : null);

  const report = (r: ImportResult) => {
    const miss = r.unmatched.length ? ` ${r.unmatched.length} not recognised: ${r.unmatched.slice(0, 4).join(", ")}${r.unmatched.length > 4 ? "…" : ""}.` : "";
    setMsg({ ok: true, text: `${r.label}: imported ${r.imported} holding${r.imported === 1 ? "" : "s"}.${miss}` });
    invalidateRoom();
  };
  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof ApiProblem ? (e.detail ?? e.title) : "Upload failed. Try again." });

  async function upload(kind: "csv" | "cas", file: File, password?: string) {
    setBusy(kind);
    setMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    if (password) fd.set("password", password);
    try {
      report(await call<ImportResult>(`/room/import/${kind}`, { method: "POST", body: fd }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <form
          className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget.elements.namedItem("cas") as HTMLInputElement;
            const pw = e.currentTarget.elements.namedItem("pw") as HTMLInputElement;
            const file = f.files?.[0];
            if (file) void upload("cas", file, pw.value).then(() => (pw.value = ""));
          }}
        >
          <FileText className="size-5 text-gold" aria-hidden="true" />
          <h3 className="mt-3 font-medium text-paper">CAS statement</h3>
          <p className="mt-1 text-[0.85rem] text-paper-dim">CDSL/NSDL or CAMS/KFintech PDF. Read in memory on ORO&rsquo;s server; the file and password are never stored.</p>
          <label className="mt-3 block text-[0.8rem] text-paper-dim" htmlFor={`${id}-cas`}>
            PDF file
          </label>
          <input id={`${id}-cas`} name="cas" type="file" accept="application/pdf,.pdf" required className="mt-1 block w-full text-[0.8rem] text-paper-dim file:mr-3 file:rounded-full file:border-0 file:bg-ink-3 file:px-3 file:py-1.5 file:text-paper" />
          <label className="mt-3 block text-[0.8rem] text-paper-dim" htmlFor={`${id}-pw`}>
            Password (usually your PAN in capitals)
          </label>
          <input id={`${id}-pw`} name="pw" type="password" autoComplete="off" required maxLength={64} className="mt-1 block w-full rounded-xl border border-line bg-ink-2 px-3 py-2 text-paper focus:border-gold focus:outline-none" />
          <button disabled={!!busy} className="btn btn-gold mt-4 h-10 w-full text-sm">
            <Upload className="size-4" aria-hidden="true" /> {busy === "cas" ? "Reading…" : "Read statement"}
          </button>
        </form>

        <div className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
          <FileSpreadsheet className="size-5 text-gold" aria-hidden="true" />
          <h3 className="mt-3 font-medium text-paper">Broker CSV</h3>
          <p className="mt-1 text-[0.85rem] text-paper-dim">Holdings export from Zerodha, Groww, Upstox, Angel One and most other brokers. Stocks, ETFs and funds are matched by ISIN.</p>
          <label className={`btn btn-ghost mt-4 h-10 w-full cursor-pointer text-sm ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <Upload className="size-4" aria-hidden="true" /> {busy === "csv" ? "Importing…" : "Choose CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 2_000_000) return setMsg({ ok: false, text: "That file is larger than a holdings export (2 MB max)." });
                void upload("csv", f);
              }}
            />
          </label>
        </div>

        <form
          className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = Number(qty);
            if (!pick || !n || n <= 0) return;
            setBusy("manual");
            try {
              await call("/room/holdings", { method: "POST", json: { instrumentId: pick.id, quantity: qty } });
              setMsg({ ok: true, text: `Added ${qtyFmt(qty)} of ${pick.name}.` });
              setPick(null);
              setQ("");
              setQty("");
              invalidateRoom();
            } catch (err) {
              fail(err);
            } finally {
              setBusy(null);
            }
          }}
        >
          <Plus className="size-5 text-gold" aria-hidden="true" />
          <h3 className="mt-3 font-medium text-paper">Add by hand</h3>
          <label className="mt-3 block text-[0.8rem] text-paper-dim" htmlFor={`${id}-q`}>
            Company, fund, ticker or ISIN
          </label>
          <div className="relative">
            <input
              id={`${id}-q`}
              value={pick ? pick.name : q}
              onChange={(e) => {
                setPick(null);
                setQ(e.target.value);
              }}
              autoComplete="off"
              role="combobox"
              aria-expanded={Boolean(hits.data?.length) && !pick}
              aria-controls={`${id}-list`}
              className="mt-1 block w-full rounded-xl border border-line bg-ink-2 px-3 py-2 text-paper focus:border-gold focus:outline-none"
            />
            {!pick && hits.data && hits.data.length > 0 && (
              <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-ink-2 p-1 shadow-2xl" data-lenis-prevent>
                {hits.data.map((h) => (
                  <li key={h.id} role="option" aria-selected={false}>
                    <button type="button" onClick={() => setPick(h)} className="w-full rounded-lg px-2.5 py-2 text-left text-[0.85rem] hover:bg-paper/5 focus-visible:bg-paper/5">
                      <span className="text-paper">{h.name}</span>
                      <span className="block font-mono text-[0.7rem] text-mute">{h.nse_symbol ?? h.bse_code ?? h.amc ?? h.isin}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="mt-3 block text-[0.8rem] text-paper-dim" htmlFor={`${id}-qty`}>
            Quantity or units
          </label>
          <input id={`${id}-qty`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1 block w-full rounded-xl border border-line bg-ink-2 px-3 py-2 text-paper focus:border-gold focus:outline-none" />
          <button disabled={!pick || !qty || !!busy} className="btn btn-ghost mt-4 h-10 w-full text-sm">
            {busy === "manual" ? "Adding…" : "Add holding"}
          </button>
        </form>
      </div>
      {msg && (
        <p role="status" className={`rounded-xl p-3 text-[0.85rem] ${msg.ok ? "bg-green/10 text-paper" : "bg-red/10 text-paper"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function Account({ label, source, items, onDelete }: { label: string; source: string; items: LiveHolding[]; onDelete: () => void }) {
  const total = items.reduce((a, h) => a + (h.valueInr ?? 0), 0);
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="rounded-[1.5rem] border border-line bg-ink-1/80" aria-label={label}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="eyebrow">
          {label} <span className="text-mute">· {source.toUpperCase()}</span>
        </h2>
        <span className="flex items-center gap-3">
          <span className="font-mono text-paper">{inr(total)}</span>
          {confirm ? (
            <span className="flex items-center gap-2 text-[0.78rem]">
              <button type="button" onClick={onDelete} className="text-red hover:underline">
                Remove all
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="text-paper-dim hover:text-paper">
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} aria-label={`Remove ${label}`} className="rounded-full p-1.5 text-paper-dim hover:text-red">
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((h) => (
          <li key={h.holdingId} className="flex items-center justify-between gap-3 px-5 py-3 text-[0.9rem]">
            <span className="min-w-0">
              <span className="text-paper">{h.name}</span>
              <span className="block font-mono text-[0.72rem] text-mute">
                {qtyFmt(h.quantity)} {h.kind === "mf_scheme" ? "units" : "sh"}
                {h.close != null ? ` × ₹${h.close.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${h.kind === "mf_scheme" ? "NAV" : "close"}` : " · no close in our records yet"}
                {h.symbol ? ` · ${h.symbol}` : ""}
              </span>
            </span>
            <span className="shrink-0 font-mono text-paper">{h.valueInr != null ? inr(h.valueInr) : "—"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LiveHoldings() {
  const me = useApi<MeOut>("/me");
  const h = useApi<HoldingsOut>(me.data?.consents.portfolio_analysis ? "/room/holdings" : null);
  const groups = useMemo(() => {
    const m = new Map<number, { label: string; source: string; items: LiveHolding[] }>();
    for (const it of h.data?.items ?? []) {
      const g = m.get(it.portfolioId) ?? { label: it.account, source: it.source, items: [] };
      g.items.push(it);
      m.set(it.portfolioId, g);
    }
    return [...m.entries()];
  }, [h.data]);

  if (me.error) return <LiveError title={me.error.title} detail={me.error.detail} onRetry={me.reload} />;
  if (!me.data) return <RoomSkeleton />;
  if (!me.data.consents.portfolio_analysis) {
    return (
      <>
        <RoomTitle icon={Wallet} eyebrow="Holdings" title={<>Bring your portfolio into Room.</>} lede="Import a CAS statement or your broker's holdings CSV. Room then shows what each piece of verified news means for your money." />
        <ConsentGate onGranted={me.reload} />
      </>
    );
  }
  const data = h.data;
  const priced = data?.items.filter((i) => i.valueInr != null).length ?? 0;
  return (
    <>
      <RoomTitle
        icon={Wallet}
        eyebrow={`Holdings · as of ${data?.asOf ? fmtDay(data.asOf) : "last"} close`}
        title={data && data.items.length ? <>{inr(data.totalInr)} across {data.items.length} holdings.</> : <>No holdings yet.</>}
        lede="Values use the last end-of-day close and the latest NAV. ORO never shows live or delayed prices."
      />
      {h.error && <LiveError title={h.error.title} detail={h.error.detail} onRetry={h.reload} />}
      {!data && !h.error && <RoomSkeleton rows={2} />}
      {data && data.items.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          {groups.map(([pid, g]) => (
            <Account
              key={pid}
              {...g}
              onDelete={async () => {
                await call(`/room/portfolios/${pid}`, { method: "DELETE" }).catch(() => undefined);
                invalidateRoom();
              }}
            />
          ))}
        </div>
      )}
      {data && priced < data.items.length && (
        <p className="mt-3 text-[0.8rem] text-mute">
          {data.items.length - priced} holding{data.items.length - priced === 1 ? " has" : "s have"} no close in ORO&rsquo;s records yet; they count once the next end-of-day file loads.
        </p>
      )}
      <section className="mt-10" aria-labelledby="import">
        <h2 id="import" className="eyebrow mb-3">
          Add or refresh holdings
        </h2>
        <ImportPanel />
      </section>
    </>
  );
}
