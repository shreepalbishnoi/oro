/**
 * Room arithmetic (PLAN §9.4): look-through exposure, groups, sectors,
 * fund overlap and the shock simulator. Pure functions; no advice, no forecasts.
 */
import { ENTITIES } from "../fixtures/market";
import { FUNDS, HOLDINGS, STORIES, type Story } from "../fixtures/room";

export type Path = { via: string; viaName: string; inr: number; weight?: number };
export type Exposure = {
  symbol: string;
  name: string;
  sector: string;
  group?: string;
  direct: number;
  viaFunds: number;
  total: number;
  share: number; // of net worth
  paths: Path[];
};

export const entity = (symbol: string) => ENTITIES.find((e) => e.symbol === symbol)!;

export const directValue = HOLDINGS.reduce((a, h) => a + h.qty * h.close, 0);
export const fundsValue = FUNDS.reduce((a, f) => a + f.value, 0);
export const netWorth = directValue + fundsValue;

export function exposures(): Exposure[] {
  const map = new Map<string, Exposure>();
  const get = (symbol: string) => {
    if (!map.has(symbol)) {
      const e = entity(symbol);
      map.set(symbol, { symbol, name: e.name, sector: e.sector, group: e.group, direct: 0, viaFunds: 0, total: 0, share: 0, paths: [] });
    }
    return map.get(symbol)!;
  };
  for (const h of HOLDINGS) {
    const x = get(h.symbol);
    const v = h.qty * h.close;
    x.direct += v;
    x.paths.push({ via: "cdsl", viaName: "Your demat", inr: v });
  }
  for (const f of FUNDS) {
    for (const [sym, w] of Object.entries(f.weights)) {
      const x = get(sym);
      const v = f.value * w;
      x.viaFunds += v;
      x.paths.push({ via: f.id, viaName: f.short, inr: v, weight: w });
    }
  }
  const out = [...map.values()].map((x) => ({ ...x, total: x.direct + x.viaFunds, share: (x.direct + x.viaFunds) / netWorth }));
  return out.sort((a, b) => b.total - a.total);
}

export function exposureOf(symbol: string) {
  return exposures().find((e) => e.symbol === symbol);
}

export function byKey(key: "group" | "sector") {
  const m = new Map<string, number>();
  for (const e of exposures()) {
    const k = (key === "group" ? e.group : e.sector) ?? "Independent";
    m.set(k, (m.get(k) ?? 0) + e.total);
  }
  const unattributed = netWorth - exposures().reduce((a, e) => a + e.total, 0);
  const rows = [...m.entries()].map(([name, inr]) => ({ name, inr, share: inr / netWorth })).sort((a, b) => b.inr - a.inr);
  return { rows, unattributed };
}

/** Pairwise overlap between funds: Σ min(weight_a, weight_b) over common holdings (disclosed top holdings only). */
export function overlap() {
  return FUNDS.map((a) =>
    FUNDS.map((b) => {
      if (a.id === b.id) return 1;
      let s = 0;
      for (const [sym, w] of Object.entries(a.weights)) if (b.weights[sym]) s += Math.min(w, b.weights[sym]);
      return s;
    }),
  );
}

export type ShockTarget = { kind: "company" | "group" | "sector"; key: string };

/** Change in ₹ if the target moves by pct. Plain arithmetic on exposure. */
export function shock(target: ShockTarget, pct: number) {
  const hits = exposures().filter((e) =>
    target.kind === "company" ? e.symbol === target.key : target.kind === "group" ? e.group === target.key : e.sector === target.key,
  );
  const base = hits.reduce((a, e) => a + e.total, 0);
  return { base, delta: (base * pct) / 100, hits };
}

export function rupeeRange(story: Story) {
  if (!story.impact) return null;
  const x = exposureOf(story.symbol);
  if (!x) return null;
  return { exposure: x.total, lo: (x.total * story.impact.p10) / 100, hi: (x.total * story.impact.p90) / 100 };
}

export function storiesFor(symbol?: string) {
  return symbol ? STORIES.filter((s) => s.symbol === symbol) : STORIES;
}

/** Sankey graph: you → accounts/funds → companies → groups. */
export function sankeyGraph() {
  const nodes: { id: string; name: string; col: number; kind: "you" | "account" | "company" | "group" }[] = [{ id: "you", name: "You", col: 0, kind: "you" }];
  const links: { source: string; target: string; value: number }[] = [];
  nodes.push({ id: "cdsl", name: "Demat", col: 1, kind: "account" });
  links.push({ source: "you", target: "cdsl", value: directValue });
  for (const f of FUNDS) {
    nodes.push({ id: f.id, name: f.short, col: 1, kind: "account" });
    links.push({ source: "you", target: f.id, value: f.value });
  }
  const ex = exposures();
  for (const e of ex) nodes.push({ id: e.symbol, name: e.name, col: 2, kind: "company" });
  nodes.push({ id: "other", name: "Other fund holdings", col: 2, kind: "company" });
  for (const e of ex) for (const p of e.paths) links.push({ source: p.via, target: e.symbol, value: p.inr });
  for (const f of FUNDS) {
    const named = Object.values(f.weights).reduce((a, w) => a + w, 0);
    links.push({ source: f.id, target: "other", value: f.value * (1 - named) });
  }
  const groups = new Set(ex.map((e) => e.group ?? "Independent"));
  for (const g of groups) nodes.push({ id: `g:${g}`, name: g, col: 3, kind: "group" });
  for (const e of ex) links.push({ source: e.symbol, target: `g:${e.group ?? "Independent"}`, value: e.total });
  return { nodes, links };
}

export const inr = (n: number, opts: { compact?: boolean; sign?: boolean } = {}) => {
  const sign = opts.sign && n > 0 ? "+" : n < 0 ? "−" : "";
  const v = Math.abs(n);
  if (opts.compact) {
    if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(2)} cr`;
    if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(2)} L`;
    if (v >= 1e3) return `${sign}₹${(v / 1e3).toFixed(1)}k`;
  }
  return `${sign}₹${Math.round(v).toLocaleString("en-IN")}`;
};

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
