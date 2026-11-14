import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FileText } from "lucide-react";
import { Chip, LABEL } from "@/components/assay/meta";
import { FanChart } from "@/components/room/story-card";
import { DiscoverInline } from "@/components/room/discover-panel";
import { RUMOURS, STORIES } from "@/lib/fixtures/room";
import { entity, exposureOf, inr, pct } from "@/lib/room/compute";
import { fmtDate, fmtTime } from "@/lib/format";

export function generateStaticParams() {
  return STORIES.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/room/story/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: STORIES.find((s) => s.id === id)?.headline ?? "Story" };
}

async function StoryPageBody({ params }: Pick<PageProps<"/room/story/[id]">, "params">) {
  const { id } = await params;
  const s = STORIES.find((x) => x.id === id);
  if (!s) notFound();
  const e = entity(s.symbol);
  const x = exposureOf(s.symbol);
  const rumours = RUMOURS.filter((r) => r.symbol === s.symbol);

  return (
    <article>
      <Link href="/room" className="inline-flex items-center gap-1.5 text-[0.85rem] text-paper-dim hover:text-paper">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to Room
      </Link>
      <p className="eyebrow mt-6">
        {e.name} · {e.exchange}: {e.symbol}
      </p>
      <h1 className="display mt-3 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.04] tracking-[-0.02em]">{s.headline}</h1>
      <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-paper-dim">{s.plain}</p>
      <p className="mt-4 flex flex-wrap items-center gap-3 text-[0.85rem] text-paper-dim">
        <Chip color="var(--gold)">{s.karat} / 24 karat</Chip>
        <span>
          Verified from <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">{s.source}</a> · {fmtDate(s.publishedAt)}, {fmtTime(s.publishedAt)} IST
        </span>
      </p>

      <section className="mt-10" aria-labelledby="claims">
        <h2 id="claims" className="eyebrow mb-3">
          Claims → evidence
        </h2>
        <ul className="space-y-2">
          {s.claims.map((c) => {
            const l = LABEL[c.label];
            return (
              <li key={c.text} className="rounded-2xl border border-line bg-ink-1/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-paper">{c.text}</p>
                  <Chip color={l.color} Icon={l.Icon}>
                    {l.label}
                  </Chip>
                </div>
                {c.quote && (
                  <p className="mt-2 flex items-start gap-2 font-mono text-[0.8rem] text-paper-dim">
                    <FileText className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden="true" />“{c.quote}”
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {s.impact && (
        <section className="mt-10" aria-labelledby="impact">
          <h2 id="impact" className="eyebrow mb-3">
            Impact range
          </h2>
          <FanChart story={s} />
        </section>
      )}

      {x && (
        <section className="mt-10" aria-labelledby="path">
          <h2 id="path" className="eyebrow mb-3">
            How this reaches you · {inr(x.total)} · {pct(x.share, 2)} of net worth
          </h2>
          <ol className="flex flex-wrap items-center gap-2 text-[0.9rem]">
            <li className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-gold">You</li>
            {x.paths.map((p) => (
              <li key={p.via} className="flex items-center gap-2">
                <span className="text-mute" aria-hidden="true">
                  →
                </span>
                <span className="rounded-full border border-line bg-ink-2 px-3 py-1.5 text-paper">
                  {p.viaName}
                  {p.weight ? <span className="text-mute"> · {pct(p.weight)} weight</span> : null} · {inr(p.inr)}
                </span>
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span className="text-mute" aria-hidden="true">
                →
              </span>
              <span className="rounded-full border border-line bg-ink-2 px-3 py-1.5 text-paper">{e.name}</span>
            </li>
          </ol>
          <Link href={`/room/xray?focus=${s.symbol}`} className="mt-3 inline-flex items-center gap-1 text-[0.85rem] text-gold">
            See it in X-ray <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </section>
      )}

      {rumours.length > 0 && (
        <section className="mt-10" aria-labelledby="rum">
          <h2 id="rum" className="eyebrow mb-3">
            Related rumours
          </h2>
          <ul className="space-y-2">
            {rumours.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-ink-1/80 p-4">
                <p className="text-paper">{r.summary}</p>
                <p className="mt-1 text-[0.8rem] font-medium text-paper-dim">
                  {r.state} · first seen {fmtDate(r.firstSeen)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DiscoverInline />
      <p className="mt-12 text-[0.78rem] text-mute">ORO reports what the filings say and how it reaches your money. It is not investment advice. The demo portfolio is made up.</p>
    </article>
  );
}

export default function StoryPage({ params }: PageProps<"/room/story/[id]">) {
  return (
    <Suspense fallback={<div className="frame min-h-[100svh] pt-40" aria-busy="true" />}>
      <StoryPageBody params={params} />
    </Suspense>
  );
}
