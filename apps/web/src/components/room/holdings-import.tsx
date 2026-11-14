"use client";

import { useEffect, useId, useState } from "react";
import { FileSpreadsheet, FileText, Plus, Trash2, Upload } from "lucide-react";
import { ENTITIES } from "@/lib/fixtures/market";
import { readLocal, writeLocal } from "@/lib/local";

type Row = { symbol: string; name: string; qty: number; known: boolean; source: string };
const KEY = "oro.imports";

const SYMBOL_COLS = /^(instrument|symbol|trading ?symbol|scrip( name)?|stock( name)?|company( name)?|security( name)?)$/i;
const QTY_COLS = /^(qty\.?|quantity|quantity available|net qty|holding qty|units)$/i;

function splitCsv(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Broker holdings CSV → rows. Handles Zerodha, Groww, Upstox and Angel One headers. Runs in the browser; nothing is uploaded. */
export function parseHoldingsCsv(text: string, source: string): { rows: Row[]; broker: string; error?: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const hIdx = lines.findIndex((l) => splitCsv(l).some((c) => SYMBOL_COLS.test(c)) && splitCsv(l).some((c) => QTY_COLS.test(c)));
  if (hIdx < 0) return { rows: [], broker: "unknown", error: "Couldn't find symbol and quantity columns. Export 'Holdings' as CSV from your broker and try again." };
  const header = splitCsv(lines[hIdx]);
  const si = header.findIndex((c) => SYMBOL_COLS.test(c));
  const qi = header.findIndex((c) => QTY_COLS.test(c));
  const h = header.join(" ").toLowerCase();
  const broker = h.includes("avg. cost") ? "Zerodha" : h.includes("stock name") ? "Groww" : h.includes("scrip") ? "Upstox" : h.includes("symbol") ? "Angel One / other" : "Broker";
  const rows: Row[] = [];
  for (const l of lines.slice(hIdx + 1)) {
    const c = splitCsv(l);
    const raw = (c[si] ?? "").replace(/-(EQ|BE|SM)$/i, "").trim();
    const qty = Number((c[qi] ?? "").replace(/,/g, ""));
    if (!raw || !Number.isFinite(qty) || qty <= 0) continue;
    const e = ENTITIES.find((x) => x.symbol.toLowerCase() === raw.toLowerCase() || x.name.toLowerCase() === raw.toLowerCase() || x.aliases.includes(raw.toLowerCase()));
    rows.push({ symbol: e?.symbol ?? raw.toUpperCase(), name: e?.name ?? raw, qty, known: !!e, source });
  }
  return { rows, broker };
}

export function HoldingsImport() {
  const id = useId();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [cas, setCas] = useState<string | null>(null);
  const [sym, setSym] = useState(ENTITIES[0].symbol);
  const [qty, setQty] = useState("");

  useEffect(() => {
    const id = requestAnimationFrame(() => setRows(readLocal<Row[]>(KEY, [])));
    return () => cancelAnimationFrame(id);
  }, []);
  const save = (r: Row[]) => {
    setRows(r);
    writeLocal(KEY, r);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        {/* CAS */}
        <form
          className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setCas("CAS statements are parsed on ORO's server, in memory only, and the password is never stored. That service connects at launch, so nothing was uploaded. Use a broker CSV for now.");
          }}
        >
          <FileText className="size-5 text-gold" aria-hidden="true" />
          <h3 className="mt-3 font-medium text-paper">CAS statement (recommended)</h3>
          <p className="mt-1 text-[0.85rem] text-paper-dim">CDSL/NSDL holdings or CAMS/KFintech funds. Arrives by email every month, protected with your PAN.</p>
          <label className="mt-3 block text-[0.8rem] text-paper-dim" htmlFor={`${id}-cas`}>
            PDF file
          </label>
          <input id={`${id}-cas`} type="file" accept="application/pdf" required className="mt-1 block w-full text-[0.8rem] text-paper-dim file:mr-3 file:rounded-full file:border-0 file:bg-ink-3 file:px-3 file:py-1.5 file:text-paper" />
          <label className="mt-3 block text-[0.8rem] text-paper-dim" htmlFor={`${id}-pw`}>
            Password
          </label>
          <input id={`${id}-pw`} type="password" autoComplete="off" required className="mt-1 block w-full rounded-xl border border-line bg-ink-2 px-3 py-2 text-paper focus:border-gold focus:outline-none" />
          <button className="btn btn-gold mt-4 h-10 w-full text-sm">
            <Upload className="size-4" aria-hidden="true" /> Read statement
          </button>
          {cas && (
            <p role="status" className="mt-3 rounded-xl bg-ink-3/70 p-3 text-[0.8rem] text-paper-dim">
              {cas}
            </p>
          )}
        </form>

        {/* CSV */}
        <div className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
          <FileSpreadsheet className="size-5 text-gold" aria-hidden="true" />
          <h3 className="mt-3 font-medium text-paper">Broker CSV</h3>
          <p className="mt-1 text-[0.85rem] text-paper-dim">Zerodha, Groww, Upstox or Angel One holdings export. Read in your browser; never uploaded.</p>
          <label className="btn btn-ghost mt-4 h-10 w-full cursor-pointer text-sm">
            <Upload className="size-4" aria-hidden="true" /> Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 2_000_000) return setMsg("That file is larger than a holdings export (2 MB max).");
                const r = parseHoldingsCsv(await f.text(), f.name);
                if (r.error) return setMsg(r.error);
                const known = r.rows.filter((x) => x.known).length;
                setMsg(`${r.broker}: read ${r.rows.length} holdings. ${known} matched the sample universe; others are valued once the instrument master connects.`);
                save([...rows.filter((x) => x.source !== f.name), ...r.rows]);
              }}
            />
          </label>
          {msg && (
            <p role="status" className="mt-3 rounded-xl bg-ink-3/70 p-3 text-[0.8rem] text-paper-dim">
              {msg}
            </p>
          )}
        </div>

        {/* Manual */}
        <form
          className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const q = Number(qty);
            if (!q || q <= 0) return;
            const ent = ENTITIES.find((x) => x.symbol === sym)!;
            save([...rows, { symbol: ent.symbol, name: ent.name, qty: q, known: true, source: "Manual" }]);
            setQty("");
          }}
        >
          <Plus className="size-5 text-gold" aria-hidden="true" />
          <h3 className="mt-3 font-medium text-paper">Add by hand</h3>
          <label className="mt-3 block text-[0.8rem] text-paper-dim" htmlFor={`${id}-sym`}>
            Company
          </label>
          <select id={`${id}-sym`} value={sym} onChange={(e) => setSym(e.target.value)} className="mt-1 block w-full rounded-xl border border-line bg-ink-2 px-3 py-2 text-paper focus:border-gold focus:outline-none">
            {ENTITIES.map((e) => (
              <option key={e.symbol} value={e.symbol}>
                {e.name} ({e.symbol})
              </option>
            ))}
          </select>
          <label className="mt-3 block text-[0.8rem] text-paper-dim" htmlFor={`${id}-qty`}>
            Quantity
          </label>
          <input id={`${id}-qty`} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} className="mt-1 block w-full rounded-xl border border-line bg-ink-2 px-3 py-2 text-paper focus:border-gold focus:outline-none" />
          <button className="btn btn-ghost mt-4 h-10 w-full text-sm">Add holding</button>
        </form>
      </div>

      {rows.length > 0 && (
        <div className="rounded-[1.5rem] border border-line bg-ink-1/80">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="eyebrow">Your imports · this browser only</h3>
            <button type="button" onClick={() => save([])} className="inline-flex items-center gap-1 text-[0.8rem] text-paper-dim hover:text-red">
              <Trash2 className="size-3.5" aria-hidden="true" /> Clear
            </button>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((r, i) => (
              <li key={`${r.symbol}${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.9rem]">
                <span className="text-paper">
                  {r.name} <span className="text-mute">{r.symbol}</span>
                </span>
                <span className="font-mono text-paper-dim">{r.qty.toLocaleString("en-IN")} sh</span>
                <span className={`text-[0.72rem] ${r.known ? "text-green" : "text-mute"}`}>{r.known ? "matched" : "pending master"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
