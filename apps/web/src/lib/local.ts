"use client";
/** Per-viewer conveniences in localStorage. Every access is guarded: storage can be blocked. */

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("oro:local", { detail: key }));
  } catch {
    /* storage unavailable: feature degrades silently */
  }
}

export function clearLocal(prefix = "oro.") {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => window.localStorage.removeItem(k));
    window.dispatchEvent(new CustomEvent("oro:local", { detail: "*" }));
  } catch {
    /* ignore */
  }
}

export type ShelfItem = { slug: string; karat: number; risk: "high" | "elevated" | "low"; summary: string; snippet: string; at: number };

export const SHELF_KEY = "oro.shelf";

export function addToShelf(item: ShelfItem) {
  const list = readLocal<ShelfItem[]>(SHELF_KEY, []).filter((x) => x.slug !== item.slug);
  writeLocal(SHELF_KEY, [item, ...list].slice(0, 60));
}
