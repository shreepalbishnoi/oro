"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, BookmarkCheck, Check, Link2, RotateCcw, Share2 } from "lucide-react";
import { gsap, reduced } from "@/lib/gsap";
import { addToShelf } from "@/lib/local";
import type { Claim, Judgment, Signal } from "@/lib/engine/types";
import { Hallmark } from "./hallmark";
import { KaratMeter } from "./karat-meter";
import { Chip, LABEL, RISK, SEV } from "./meta";
import type { AssayState, Stage } from "./use-assay";

const STAGES: { id: Stage; label: string }[] = [
  { id: "scrub", label: "Privacy" },
  { id: "signals", label: "Scam check" },
  { id: "claims", label: "Claims" },
  { id: "evidence", label: "Records" },
  { id: "karat", label: "Score" },
];
const ORDER: Stage[] = ["idle", "scrub", "signals", "claims", "evidence", "karat", "done"];

function StageRail({ stage }: { stage: Stage }) {
  const at = ORDER.indexOf(stage);
  return (
    <ol className="flex items-center gap-1.5" aria-label="Assay progress">
      {STAGES.map((s, i) => {
        const idx = ORDER.indexOf(s.id);
        const done = at > idx;
        const now = at === idx;
        return (
          <li key={s.id} className="flex items-center gap-1.5" aria-current={now ? "step" : undefined}>
            <span
              className={`relative grid size-5 place-items-center rounded-full border text-[0.6rem] transition-colors duration-500 ${done ? "border-gold bg-gold text-ink" : now ? "border-gold text-gold" : "border-line-strong text-mute"}`}
            >
              {done ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : i + 1}
              {now && <span className="absolute size-5 animate-ping rounded-full border border-gold/60" aria-hidden="true" />}
            </span>
            <span className={`hidden text-[0.8rem] font-medium sm:inline ${done || now ? "text-paper" : "text-mute"}`}>{s.label}</span>
            {i < STAGES.length - 1 && <span className={`h-px w-3 sm:w-5 ${done ? "bg-gold" : "bg-line-strong"}`} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

/** Each new child flips in like a stamped chip. */
function useStampIn(dep: number) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const last = ref.current?.lastElementChild;
    if (!last || reduced()) return;
    gsap.fromTo(last, { opacity: 0, y: 14, rotateX: -70, transformPerspective: 600 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.6, ease: "back.out(1.6)" });
  }, [dep]);
  return ref;
}

export function SignalRow({ s }: { s: Signal }) {
  const sev = SEV[s.severity];
  return (
    <li className="rounded-2xl border border-line bg-ink-1/70 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={sev.color}>{sev.label}</Chip>
        <p className="font-medium leading-snug text-paper">{s.title}</p>
      </div>
      {s.span && <p className="mt-2 border-l-2 pl-2.5 font-mono text-[0.78rem] leading-relaxed text-paper-dim" style={{ borderColor: sev.color }}>“{s.span}”</p>}
      <p className="mt-2 text-[0.85rem] leading-relaxed text-paper-dim">{s.detail}</p>
      {s.evidence && (
        <a href={s.evidence.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[0.8rem] text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
          {s.evidence.label} <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

export function ClaimRow({ c, j }: { c: Claim; j?: Judgment }) {
  const l = j ? LABEL[j.label] : null;
  return (
    <li className="rounded-2xl border border-line bg-ink-1/70 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.92rem] leading-snug text-paper">“{c.text}”</p>
        {l ? (
          <Chip color={l.color} Icon={l.Icon} className="shrink-0">
            {l.label}
          </Chip>
        ) : (
          <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[0.75rem] text-mute">
            <span className="inline-block animate-pulse">Checking</span>
          </span>
        )}
      </div>
      {j && (
        <div className="mt-2.5 space-y-2">
          <p className="text-[0.85rem] leading-relaxed text-paper-dim">{j.reason}</p>
          {j.quote && j.doc && (
            <figure className="rounded-xl bg-ink-3/60 p-2.5">
              <blockquote className="font-mono text-[0.75rem] leading-relaxed text-paper">“{j.quote}”</blockquote>
              <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[0.72rem] text-mute">
                <span className="text-gold">{j.doc.source}</span>
                <span>·</span>
                <time dateTime={j.doc.publishedAt}>{new Date(j.doc.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</time>
                <span>·</span>
                <span>{j.grounded ? "quote verified in source" : "quote not found, downgraded"}</span>
                <a href={j.doc.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-0.5 text-paper-dim hover:text-gold">
                  Source <ArrowUpRight className="size-3" aria-hidden="true" />
                </a>
              </figcaption>
            </figure>
          )}
        </div>
      )}
    </li>
  );
}

export function shareText(karat: number, risk: keyof typeof RISK, summary: string, url: string) {
  return `ORO checked this tip: ${karat}/24 karat, ${RISK[risk].label}. ${summary}\n${url}`;
}

export function VerdictActions({ state, onReset }: { state: AssayState; onReset?: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  if (state.stage !== "done" || !state.verdict || !state.slug) return null;
  const v = state.verdict;
  const url = `${window.location.origin}/v/${state.slug}`;
  const text = shareText(v.karat, v.risk, v.summary, url);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/v/${state.slug}`} className="btn btn-gold h-10 px-4 text-sm">
        Open full verdict <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="btn btn-ghost h-10 px-4 text-sm">
        <Share2 className="size-4" aria-hidden="true" /> WhatsApp
      </a>
      <button
        type="button"
        className="btn btn-ghost h-10 px-4 text-sm"
        onClick={async () => {
          try {
            if (navigator.share) await navigator.share({ title: "ORO verdict", text, url });
            else {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }
          } catch {
            /* user cancelled */
          }
        }}
      >
        <Link2 className="size-4" aria-hidden="true" /> {copied ? "Link copied" : "Share link"}
      </button>
      <button
        type="button"
        className="btn btn-ghost h-10 px-4 text-sm"
        aria-pressed={saved}
        onClick={() => {
          addToShelf({ slug: state.slug!, karat: v.karat, risk: v.risk, summary: v.summary, snippet: v.input.redacted.slice(0, 140), at: Date.now() });
          setSaved(true);
        }}
      >
        {saved ? <BookmarkCheck className="size-4 text-gold" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
        {saved ? "Saved" : "Save result"}
      </button>
      {onReset && (
        <button type="button" onClick={onReset} className="btn h-10 px-3 text-sm text-paper-dim hover:text-paper">
          <RotateCcw className="size-4" aria-hidden="true" /> Check another
        </button>
      )}
    </div>
  );
}

/** The live assay: stages stream in, chips stamp, Karat fills, hallmark lands. */
export function LiveAssay({ state, onReset, compact = false }: { state: AssayState; onReset?: () => void; compact?: boolean }) {
  const sigRef = useStampIn(state.signals.length);
  const judged = Object.keys(state.judgments).length;
  const claimRef = useStampIn(judged);
  if (state.stage === "idle") return null;

  const maxSig = compact ? 3 : 99;
  const maxClaims = compact ? 3 : 99;
  const r = state.risk ? RISK[state.risk] : null;

  return (
    <section aria-live="polite" aria-busy={state.stage !== "done" && state.stage !== "error"} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StageRail stage={state.stage} />
        {state.piiRemoved > 0 && (
          <p className="text-[0.8rem] font-medium text-mute">
            {state.piiRemoved} personal detail{state.piiRemoved > 1 ? "s" : ""} removed
          </p>
        )}
      </div>

      {state.stage === "error" && <p className="rounded-2xl border border-red/40 bg-red/10 p-4 text-paper">{state.error}</p>}

      <div className={`grid gap-5 ${compact ? "md:grid-cols-[auto_1fr]" : "lg:grid-cols-[auto_1fr]"}`}>
        <div className="flex flex-row items-center gap-5 md:flex-col md:items-center md:gap-3">
          <KaratMeter value={state.karat} pending={state.karat === undefined} size={compact ? 150 : 180} />
          <div className="flex flex-col items-start gap-3 md:items-center">
            {r && (
              <Chip color={r.color} Icon={r.Icon}>
                {r.label}
              </Chip>
            )}
            {state.stage === "done" && state.verdict && <Hallmark karat={state.verdict.karat} risk={state.verdict.risk} size={compact ? 96 : 112} />}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {state.verdict && <p className="font-display text-[1.3rem] leading-snug text-paper sm:text-[1.45rem]">{state.verdict.summary}</p>}

          {state.trail && (
            <p className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/5 px-3 py-2 text-[0.85rem] text-paper">
              <span className="font-mono text-gold">Forward Trail</span>
              Checked {state.trail.count.toLocaleString("en-IN")} times in {state.trail.variants} variants · first seen {state.trail.firstSeenDaysAgo === 0 ? "today" : `${state.trail.firstSeenDaysAgo} days ago`}
            </p>
          )}

          {state.signals.length > 0 && (
            <div>
              <h3 className="mb-2 text-[0.95rem] font-medium text-paper">Warning signs ({state.signals.length})</h3>
              <ul ref={sigRef} className="space-y-2">
                {state.signals.slice(0, maxSig).map((s, i) => (
                  <SignalRow key={`${s.id}-${i}`} s={s} />
                ))}
              </ul>
              {state.signals.length > maxSig && <p className="mt-2 text-[0.8rem] text-mute">+{state.signals.length - maxSig} more in the full verdict</p>}
            </div>
          )}
          {state.stage === "signals" && state.signals.length === 0 && <p className="text-sm text-mute">Looking for scam patterns…</p>}

          {state.claims.length > 0 && (
            <div>
              <h3 className="mb-2 text-[0.95rem] font-medium text-paper">
                Claims: {judged} of {state.claims.length} checked
              </h3>
              <ul ref={claimRef} className="space-y-2">
                {state.claims.slice(0, maxClaims).map((c) => (
                  <ClaimRow key={c.id} c={c} j={state.judgments[c.id]} />
                ))}
              </ul>
            </div>
          )}
          {state.stage === "done" && state.claims.length === 0 && (
            <p className="text-sm text-paper-dim">No checkable factual claim found. The verdict rests on scam signals and source.</p>
          )}

          <VerdictActions state={state} onReset={onReset} />
          {state.stage === "done" && (
            <p className="text-[0.75rem] leading-relaxed text-mute">
              Rules-engine preview on sample records. AI claim checks arrive with the evidence pipeline. ORO checks claims; it never tells you what to do with a stock.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
