import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Hallmark } from "@/components/assay/hallmark";
import { KaratMeter } from "@/components/assay/karat-meter";
import { ClaimRow, SignalRow } from "@/components/assay/live-assay";
import { Loupe } from "@/components/assay/loupe";
import { Chip, RISK } from "@/components/assay/meta";
import { VerdictActions } from "@/components/assay/verdict-actions";
import { scrub } from "@/lib/engine/scrub";
import { encodeSlug } from "@/lib/engine/slug";
import type { Verdict } from "@/lib/engine/types";
import { loadVerdict, MODE_LABEL } from "@/lib/server/verdicts";

// One short sample is prerendered (long slugs exceed Windows path limits); every other verdict renders on request.
export function generateStaticParams() {
  return [{ slug: encodeSlug(scrub("Guaranteed 40% return in 30 days. VIP group, only today.").redacted) }];
}


export async function generateMetadata({ params }: PageProps<"/v/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const v = (await loadVerdict(slug))?.verdict;
  if (!v) return { title: "Verdict not found" };
  return {
    title: `${v.karat}/24 karat · ${RISK[v.risk].label}`,
    description: v.summary,
    robots: { index: false },
  };
}

/** Marks the parts of the tip that triggered a signal. */
function Marked({ v, truth }: { v: Verdict; truth?: boolean }) {
  const text = v.input.redacted;
  const ranges: { a: number; b: number; color: string; note: string }[] = [];
  for (const s of v.signals) {
    if (!s.span) continue;
    const core = s.span.replace(/^…|…$/g, "").trim();
    const a = text.indexOf(core);
    if (a < 0 || ranges.some((r) => a < r.b && a + core.length > r.a)) continue;
    ranges.push({ a, b: a + core.length, color: s.severity === "severe" ? "var(--red)" : "var(--gold)", note: s.title });
  }
  ranges.sort((x, y) => x.a - y.a);
  const parts: React.ReactNode[] = [];
  let i = 0;
  ranges.forEach((r, k) => {
    if (r.a > i) parts.push(<span key={`t${k}`}>{text.slice(i, r.a)}</span>);
    parts.push(
      truth ? (
        <mark key={`m${k}`} title={r.note} className="rounded-sm text-paper [box-decoration-break:clone]" style={{ background: `color-mix(in oklab, ${r.color} 24%, transparent)`, boxShadow: `inset 0 -2px 0 ${r.color}` }}>
          {text.slice(r.a, r.b)}
        </mark>
      ) : (
        <span key={`m${k}`}>{text.slice(r.a, r.b)}</span>
      ),
    );
    i = r.b;
  });
  parts.push(<span key="end">{text.slice(i)}</span>);
  return (
    <div className={`rounded-[1.5rem] rounded-tl-md border p-5 ${truth ? "border-gold/40 bg-[#0d1220]" : "border-line bg-ink-2"}`}>
      <p className="mb-2 text-[0.8rem] font-medium text-mute">{truth ? "Seen through ORO" : `The ${v.input.kind === "link" ? "link" : "message"}, personal details removed`}</p>
      <p className="text-[1.02rem] leading-[1.9] whitespace-pre-line text-paper">{parts}</p>
    </div>
  );
}

async function VerdictPageBody({ params }: Pick<PageProps<"/v/[slug]">, "params">) {
  const { slug } = await params;
  const loaded = await loadVerdict(slug);
  if (!loaded) notFound();
  const { verdict: v, checkedAt, live } = loaded;
  const r = RISK[v.risk];
  const p = v.karatParts;

  return (
    <div data-chapter="assay">
      <section className="frame pt-32 pb-12 sm:pt-40">
        <p className="eyebrow">Parakh verdict · {v.version} · {MODE_LABEL[v.mode] ?? v.mode}</p>
        <div className="mt-8 grid items-start gap-10 lg:grid-cols-[auto_1fr]">
          <div className="flex items-center gap-6 lg:flex-col">
            <KaratMeter value={v.karat} size={200} />
            <div className="flex flex-col items-center gap-3">
              <Chip color={r.color} Icon={r.Icon}>
                {r.label}
              </Chip>
              <Hallmark karat={v.karat} risk={v.risk} size={124} date={checkedAt} />
            </div>
          </div>
          <div className="min-w-0 space-y-6">
            <h1 className="display text-[clamp(1.7rem,3.2vw,2.7rem)] leading-[1.08] tracking-[-0.02em]">{v.summary}</h1>
            <Loupe label="The checked message. Move the loupe to see what triggered each signal." surface={<Marked v={v} />} truth={<Marked v={v} truth />} radius={110} />
            <VerdictActions slug={slug} karat={v.karat} risk={v.risk} summary={v.summary} snippet={v.input.redacted.slice(0, 140)} />
          </div>
        </div>
      </section>

      <section className="frame grid gap-10 pb-16 lg:grid-cols-2">
        <div>
          <h2 className="eyebrow mb-3">Scam signals · {v.signals.length}</h2>
          {v.signals.length ? (
            <ul className="space-y-2">
              {v.signals.map((s, i) => (
                <SignalRow key={`${s.id}${i}`} s={s} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-line p-4 text-paper-dim">No scam pattern found.</p>
          )}
        </div>
        <div>
          <h2 className="eyebrow mb-3">Claims and evidence · {v.claims.length}</h2>
          {v.claims.length ? (
            <ul className="space-y-2">
              {v.claims.map((c) => (
                <ClaimRow key={c.id} c={c} j={v.judgments.find((j) => j.claimId === c.id)} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-line p-4 text-paper-dim">No checkable factual claim found in this message.</p>
          )}
        </div>
      </section>

      <section className="frame grid gap-5 pb-16 md:grid-cols-3">
        <article className="glass rounded-[1.5rem] p-5">
          <h2 className="eyebrow">Forward Trail</h2>
          {v.trail ? (
            <>
              <p className="display mt-3 text-4xl text-gold">{v.trail.count.toLocaleString("en-IN")}</p>
              <p className="mt-1 text-paper-dim">
                checks of this message in {v.trail.variants} variants, first seen {v.trail.firstSeenDaysAgo} days ago{v.trail.channels.length ? `, on ${v.trail.channels.join(", ")}` : ""}.
              </p>
            </>
          ) : (
            <p className="mt-3 text-paper-dim">Fewer than 3 people have checked this message, so we don&rsquo;t show a count (it protects whoever sent it to you).</p>
          )}
          <p className="mt-3 text-[0.75rem] text-mute">Fingerprints only. ORO never stores the text of your tips.</p>
        </article>

        <article className="glass rounded-[1.5rem] p-5 md:col-span-2">
          <h2 className="eyebrow">Who&rsquo;s on the other side?</h2>
          {v.otherSide.length ? (
            <ul className="mt-3 divide-y divide-line">
              {v.otherSide.map((d, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[0.9rem]">
                  <span className="font-mono text-[0.75rem] text-mute">{new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  <span className="text-paper-dim">{d.kind}</span>
                  <span className="text-paper">{d.party}</span>
                  <span className="text-paper">{d.detail}</span>
                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[0.8rem] text-gold">
                    {d.source} <ArrowUpRight className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-paper-dim">No bulk deals, insider trades or pledge changes in the last 30 days for the companies named.</p>
          )}
          <p className="mt-3 text-[0.75rem] text-mute">These are public disclosures. They do not prove wrongdoing. Names appear exactly as filed.</p>
        </article>
      </section>

      <section className="frame pb-28">
        <h2 className="eyebrow">How this Karat was calculated</h2>
        <dl className="mt-4 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-[1.25rem] border border-line bg-line font-mono text-[0.85rem] sm:grid-cols-6">
          {[
            ["Base", p.base],
            ["Evidence", p.evidence],
            ["Source", p.source],
            ["Language", p.language],
            ["Scam", p.scam],
            ["Karat", v.karat],
          ].map(([k, n]) => (
            <div key={k as string} className="bg-ink-1/90 p-3">
              <dt className="text-[0.8rem] font-medium  text-mute">{k}</dt>
              <dd className={`mt-1 text-lg ${k === "Karat" ? "text-gold" : "text-paper"}`}>{typeof n === "number" && n > 0 && k !== "Base" && k !== "Karat" ? `+${n}` : n}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-3xl text-[0.82rem] leading-relaxed text-mute">
          {p.capped ? "Capped at 23: a perfect 24 needs every checkable claim supported by an exchange or regulator source. " : ""}
          {live
            ? "Each claim was checked against BSE/NSE filings and SEBI records; a claim counts as supported only when a filing's exact words back it. "
            : "Rules-engine preview on sample records (the live checker was unreachable). "}
          ORO checks whether claims are true. It is not investment advice and never says what to do with a stock.{" "}
          <Link href="/methodology" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
            Methodology
          </Link>
        </p>
      </section>
    </div>
  );
}

export default function VerdictPage({ params }: PageProps<"/v/[slug]">) {
  return (
    <Suspense fallback={<div className="frame min-h-[100svh] pt-40" aria-busy="true" />}>
      <VerdictPageBody params={params} />
    </Suspense>
  );
}
