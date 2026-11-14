"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Download, Flag, Link2, Share2 } from "lucide-react";
import { addToShelf } from "@/lib/local";
import type { RiskBand } from "@/lib/engine/types";
import { shareText } from "./live-assay";

/** Share, save and report actions on a public verdict page. */
export function VerdictActions({ slug, karat, risk, summary, snippet }: { slug: string; karat: number; risk: RiskBand; summary: string; snippet: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const url = () => `${window.location.origin}/v/${slug}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-gold h-11 px-4 text-sm" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText(karat, risk, summary, url()))}`, "_blank", "noopener")}>
          <Share2 className="size-4" aria-hidden="true" /> Share on WhatsApp
        </button>
        <button
          type="button"
          className="btn btn-ghost h-11 px-4 text-sm"
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title: "ORO verdict", text: shareText(karat, risk, summary, url()), url: url() });
              else {
                await navigator.clipboard.writeText(url());
                setCopied(true);
              }
            } catch {
              /* cancelled */
            }
          }}
        >
          <Link2 className="size-4" aria-hidden="true" /> {copied ? "Link copied" : "Share link"}
        </button>
        <a className="btn btn-ghost h-11 px-4 text-sm" href={`/api/hallmark/${slug}`} download={`oro-hallmark-${karat}k.png`}>
          <Download className="size-4" aria-hidden="true" /> Result card
        </a>
        <button
          type="button"
          className="btn btn-ghost h-11 px-4 text-sm"
          aria-pressed={saved}
          onClick={() => {
            addToShelf({ slug, karat, risk, summary, snippet, at: Date.now() });
            setSaved(true);
          }}
        >
          {saved ? <BookmarkCheck className="size-4 text-gold" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
          {saved ? "Saved" : "Save result"}
        </button>
      </div>

      {!reported ? (
        <div>
          <button type="button" onClick={() => setReporting((r) => !r)} aria-expanded={reporting} className="inline-flex items-center gap-1.5 text-[0.85rem] text-paper-dim underline-offset-4 hover:text-paper hover:underline">
            <Flag className="size-4" aria-hidden="true" /> Think this verdict is wrong? Report an error
          </button>
          {reporting && (
            <form
              className="mt-3 max-w-xl space-y-3 rounded-2xl border border-line bg-ink-1/80 p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, what: fd.get("what"), link: fd.get("link") }) }).catch(() => undefined);
                setReported(true);
              }}
            >
              <label className="block text-[0.85rem] text-paper-dim">
                What&rsquo;s wrong?
                <textarea name="what" required rows={3} maxLength={1000} className="mt-1.5 block w-full rounded-xl border border-line bg-ink-2 p-3 text-paper focus:border-gold focus:outline-none" />
              </label>
              <label className="block text-[0.85rem] text-paper-dim">
                Link to a filing or source (optional)
                <input name="link" type="url" className="mt-1.5 block w-full rounded-xl border border-line bg-ink-2 p-2.5 text-paper focus:border-gold focus:outline-none" />
              </label>
              <button className="btn btn-gold h-10 px-4 text-sm">Send report</button>
            </form>
          )}
        </div>
      ) : (
        <p role="status" className="text-[0.88rem] text-green">
          Thanks. A person will review this; if the verdict changes, it&rsquo;s logged publicly on the corrections page.
        </p>
      )}
    </div>
  );
}
