"use client";
/**
 * Live Room data from the API (through the /api/v1 BFF). Shapes mirror backend/app/api/routes/room.py.
 * A tiny in-memory cache keeps page switches instant; any write calls invalidateRoom().
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type LiveHolding = {
  holdingId: number;
  portfolioId: number;
  account: string;
  source: string;
  instrumentId: number;
  symbol: string | null;
  isin: string | null;
  name: string;
  kind: "equity" | "mf_scheme";
  quantity: string;
  close: number | null;
  valueInr: number | null;
  asOf: string | null;
};
export type HoldingsOut = { items: LiveHolding[]; totalInr: number; asOf: string | null; note: string };

export type LivePath = { via: string; viaName: string; inr: number; weight: number | null };
export type LiveExposure = {
  instrumentId: number;
  symbol: string | null;
  name: string;
  sector: string | null;
  group: string | null;
  directInr: number;
  viaFundsInr: number;
  totalInr: number;
  share: number;
  paths: LivePath[];
};
export type Split = { name: string; inr: number; share: number };
export type XrayOut = {
  netWorthInr: number;
  asOf: string | null;
  exposures: LiveExposure[];
  groups: Split[];
  sectors: Split[];
  sankey: { nodes: { id: string; label: string; kind: string }[]; links: { source: string; target: string; inr: number }[] };
  overlap: { a: string; b: string; overlap: number; common: number }[];
  coverage: { fundsLookedThroughInr: number; fundsWithoutDisclosureInr: number };
};
export type ShockOut = {
  kind: string;
  target: string;
  pct: number;
  exposedInr: number;
  changeInr: number;
  changeShareOfNetWorth: number;
  companies: { symbol: string | null; name: string; exposedInr: number }[];
  note: string;
};
export type FeedItem = {
  id: number;
  title: string;
  summary: string;
  url: string;
  source: string;
  tier: number;
  publishedAt: string;
  deniesRumour: boolean;
  symbols: string[];
  instrumentIds: number[];
  read: boolean;
  rank: number;
  yourExposureInr: number | null;
  viaFunds: number;
};
export type FeedOut = { items: FeedItem[]; nextCursor: number | null };
export type SummaryOut = {
  netWorthInr: number;
  asOf: string | null;
  sinceYouLastCame: FeedItem[];
  lastSeenAt: string | null;
  topExposures: { symbol: string | null; name: string; totalInr: number; share: number }[];
  topGroup: Split | null;
};
export type DiscoverCard = { kind: "connected" | "funds" | "filings" | "concentration"; title: string; items: Record<string, unknown>[] };
export type DiscoverOut = { storyId: number; cards: DiscoverCard[]; disclaimer: string; asOf: string };
export type ImportResult = { portfolioId: number; label: string; imported: number; unmatched: string[]; statementDate: string | null; warnings: string[] };
export type MeOut = { id: number; email: string | null; displayName: string | null; consents: Record<string, boolean>; createdAt: string };
export type InstrumentHit = { id: number; kind: string; name: string; nse_symbol: string | null; bse_code: string | null; isin: string | null; amc: string | null };

export class ApiProblem extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(detail ?? title);
  }
}

export async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(`/api/v1${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, cache: "no-store" });
  if (!res.ok) {
    const p = (await res.json().catch(() => ({}))) as { title?: string; detail?: string } & Record<string, unknown>;
    throw new ApiProblem(res.status, p.title ?? "Something went wrong", p.detail, p);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// ---- cache ------------------------------------------------------------------------------
type Entry = { data?: unknown; error?: ApiProblem; at: number; inflight?: Promise<void> };
const cache = new Map<string, Entry>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Drop every cached Room response (after an import, delete or consent change). */
export function invalidateRoom() {
  cache.clear();
  emit();
}

const FRESH_MS = 60_000;

function load(path: string) {
  const e = cache.get(path) ?? { at: 0 };
  if (e.inflight) return;
  e.inflight = call<unknown>(path)
    .then((data) => {
      cache.set(path, { data, at: Date.now() });
    })
    .catch((error: unknown) => {
      cache.set(path, { error: error instanceof ApiProblem ? error : new ApiProblem(0, "Couldn't reach ORO", "Check your connection and try again."), at: Date.now() });
    })
    .finally(emit);
  cache.set(path, e);
}

/** GET with stale-while-revalidate. `path` null = skip. */
export function useApi<T>(path: string | null) {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const e = path ? cache.get(path) : undefined;
  useEffect(() => {
    if (!path) return;
    const cur = cache.get(path);
    if (!cur || (!cur.inflight && Date.now() - cur.at > FRESH_MS)) load(path);
  }, [path, e?.at]);
  const reload = useCallback(() => {
    if (path) {
      cache.delete(path);
      load(path);
    }
  }, [path]);
  return {
    data: e?.data as T | undefined,
    error: e?.error,
    loading: Boolean(path) && !e?.data && !e?.error,
    reload,
  };
}

/** Small debounce for search boxes. */
export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}
