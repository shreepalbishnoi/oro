/**
 * Forward Trail (PLAN §9.3): SimHash fingerprints of normalised tip text.
 * Stores hashes only, never text. Counts are shown only at ≥ 3 checks.
 * In this preview the store is in-process memory, seeded with the sample tips.
 */
import { normalize } from "./entities";
import type { Trail } from "./types";

function fnv1a(s: string, seed: number) {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 64-bit SimHash as two 32-bit halves over word 3-shingles. Numbers are kept. */
export function simhash(text: string): [number, number] {
  const words = normalize(text).split(" ").filter(Boolean);
  const shingles = words.length < 3 ? [words.join(" ")] : words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(" "));
  const v = new Array(64).fill(0);
  for (const sh of shingles) {
    const a = fnv1a(sh, 0);
    const b = fnv1a(sh, 0x9e3779b9);
    for (let i = 0; i < 32; i++) {
      v[i] += (a >>> i) & 1 ? 1 : -1;
      v[32 + i] += (b >>> i) & 1 ? 1 : -1;
    }
  }
  let hi = 0,
    lo = 0;
  for (let i = 0; i < 32; i++) {
    if (v[i] > 0) lo |= 1 << i;
    if (v[32 + i] > 0) hi |= 1 << i;
  }
  return [hi >>> 0, lo >>> 0];
}

function popcount(x: number) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function hamming(a: [number, number], b: [number, number]) {
  return popcount((a[0] ^ b[0]) >>> 0) + popcount((a[1] ^ b[1]) >>> 0);
}

type Row = { hash: [number, number]; count: number; variants: number; firstSeen: number; channels: string[] };

const g = globalThis as typeof globalThis & { __oroTrail?: Row[] };
const DAY = 86_400_000;

/** Fixed clock for prerendered pages and tests; live checks pass the real time. */
export const PREVIEW_NOW = Date.parse("2026-11-10T12:00:00+05:30");

export function seedTrail(seeds: { text: string; count: number; variants: number; daysAgo: number; channels: string[] }[], now = PREVIEW_NOW) {
  if (g.__oroTrail) return;
  g.__oroTrail = seeds.map((s) => ({ hash: simhash(s.text), count: s.count, variants: s.variants, firstSeen: now - s.daysAgo * DAY, channels: s.channels }));
}

/** Records a check and returns the trail (null below the privacy threshold). */
export function recordAndRead(text: string, record = true, now = PREVIEW_NOW): Trail | null {
  const rows = (g.__oroTrail ??= []);
  const h = simhash(text);
  let best: Row | undefined;
  let bestD = 99;
  for (const r of rows) {
    const d = hamming(r.hash, h);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  if (best && bestD <= 8) {
    if (record) {
      best.count++;
      if (bestD > 0) best.variants++;
    }
  } else if (record) {
    best = { hash: h, count: 1, variants: 1, firstSeen: now, channels: [] };
    rows.push(best);
  }
  if (!best || best.count < 3) return null;
  return {
    count: best.count,
    variants: best.variants,
    firstSeenDaysAgo: Math.max(0, Math.round((now - best.firstSeen) / DAY)),
    channels: best.channels,
  };
}
