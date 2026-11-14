import "server-only";
import { assay } from "@/lib/engine/assay";
import { decodeSlug } from "@/lib/engine/slug";
import { PREVIEW_NOW } from "@/lib/engine/trail";
import type { Verdict } from "@/lib/engine/types";
import { api } from "./api";

export type LoadedVerdict = { verdict: Verdict; checkedAt: Date; live: boolean };

/**
 * Verdict links come in two forms:
 *  - `c<checkId>`: a check stored by the API (the id is a random capability; only redacted text is kept)
 *  - `t|l|i<deflated text>`: the stateless rules-preview link used when the API was unreachable
 */
export async function loadVerdict(slug: string): Promise<LoadedVerdict | null> {
  if (slug.startsWith("c") && /^c[\w-]{6,32}$/.test(slug)) {
    try {
      const c = await api<{ verdict: Verdict | null; createdAt: string; status: string }>(`/v1/checks/${slug.slice(1)}`, null, {
        signal: AbortSignal.timeout(5_000),
      });
      return c.verdict ? { verdict: c.verdict, checkedAt: new Date(c.createdAt), live: true } : null;
    } catch {
      return null;
    }
  }
  const d = decodeSlug(slug);
  if (!d) return null;
  return { verdict: assay(d.text, d.kind, { now: PREVIEW_NOW }), checkedAt: new Date(PREVIEW_NOW), live: false };
}

export const MODE_LABEL: Record<string, string> = {
  "rules-preview": "rules preview",
  assay: "AI-checked against records",
  "records-only": "records and rules",
};
