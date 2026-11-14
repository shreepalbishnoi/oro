import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, FileText } from "lucide-react";
import { DISCLOSURES, ENTITIES, EVIDENCE } from "@/lib/fixtures/market";
import { FLAGS, RUMOURS } from "@/lib/fixtures/room";
import { fmtDate } from "@/lib/format";

export function generateStaticParams() {
  return ENTITIES.map((e) => ({ symbol: e.symbol }));
}

export async function generateMetadata({ params }: PageProps<"/s/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const e = ENTITIES.find((x) => x.symbol === symbol);
  return e ? { title: `${e.name}: what's true`, description: `Verified filings, rumours, red flags and disclosures for ${e.name} (${e.symbol}). No prices, no tips.` } : { title: "Company" };
}

/** Company truth page: rumours, red flags, checks and filings. No prices (PLAN §7 display rules). */
async function CompanyPageBody({ params }: Pick<PageProps<"/s/[symbol]">, "params">) {
  const { symbol } = await params;
  const e = ENTITIES.find((x) => x.symbol === symbol);
  if (!e) notFound();
  const docs = EVIDENCE.filter((d) => d.symbol === symbol).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const flags = FLAGS.filter((f) => f.symbol === symbol);
  const rumours = RUMOURS.filter((r) => r.symbol === symbol);
  const disc = DISCLOSURES[symbol] ?? [];

  return (
    <div data-chapter="page" className="frame pt-36 pb-28 sm:pt-44">
      <p className="eyebrow">
        {e.exchange}: {e.symbol} · {e.sector}
        {e.group ? ` · ${e.group}` : ""}
      </p>
      <h1 className="display mt-4 text-[clamp(2.6rem,7vw,5.4rem)] leading-[0.96] tracking-[-0.028em]">{e.name}</h1>
      <div className="mt-5 flex flex-wrap gap-2 text-[0.8rem]">
        {e.surveillance && <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-gold">◆ {e.surveillance}</span>}
        {e.sme && <span className="rounded-full border border-line px-3 py-1 text-paper-dim">SME platform</span>}
        <span className="rounded-full border border-line px-3 py-1 text-mute">Sample company · fictional</span>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="filings">
          <h2 id="filings" className="eyebrow mb-4">
            Latest filings
          </h2>
          <ul className="space-y-3">
            {docs.map((d) => (
              <li key={d.id} className="rounded-2xl border border-line bg-ink-1/80 p-4">
                <p className="flex items-center gap-2 font-mono text-[0.72rem] text-mute">
                  <FileText className="size-3.5 text-gold" aria-hidden="true" />
                  {d.source} · {fmtDate(d.publishedAt, { day: "numeric", month: "short", year: "numeric" })}
                  {d.denies && <span className="text-red">· denial</span>}
                </p>
                <p className="mt-1.5 text-paper">{d.title}</p>
                <p className="mt-1 text-[0.88rem] leading-relaxed text-paper-dim">{d.text}</p>
                <a href={d.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-0.5 text-[0.8rem] text-gold">
                  Open on exchange <ArrowUpRight className="size-3" aria-hidden="true" />
                </a>
              </li>
            ))}
            {docs.length === 0 && <li className="text-paper-dim">No filings in the sample records.</li>}
          </ul>
        </section>
        <aside className="space-y-5">
          <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5" aria-labelledby="rum">
            <h2 id="rum" className="eyebrow">
              Rumours
            </h2>
            {rumours.length ? (
              <ul className="mt-3 space-y-2">
                {rumours.map((r) => (
                  <li key={r.id}>
                    <p className="text-paper">“{r.summary}”</p>
                    <p className="text-[0.8rem] font-medium text-paper-dim">{r.state}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-paper-dim">No tracked rumours.</p>
            )}
          </section>
          <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5" aria-labelledby="fl">
            <h2 id="fl" className="eyebrow">
              Red flags
            </h2>
            {flags.length ? (
              <ul className="mt-3 space-y-2">
                {flags.map((f) => (
                  <li key={f.title}>
                    <p className="text-paper">{f.title}</p>
                    <p className="text-[0.75rem] text-mute">
                      {f.source} · {fmtDate(f.date)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-paper-dim">None in the records we track.</p>
            )}
          </section>
          <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5" aria-labelledby="ds">
            <h2 id="ds" className="eyebrow">
              Disclosed deals · 30 days
            </h2>
            {disc.length ? (
              <ul className="mt-3 space-y-2 text-[0.88rem]">
                {disc.map((d, k) => (
                  <li key={k}>
                    <p className="text-paper">
                      {d.kind}: {d.detail}
                    </p>
                    <p className="text-[0.75rem] text-mute">
                      {d.party} · {fmtDate(d.date)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-paper-dim">No bulk, block or insider deals.</p>
            )}
            <p className="mt-3 text-[0.72rem] text-mute">Public disclosures. Not proof of wrongdoing.</p>
          </section>
          <Link href="/parakh" className="btn btn-gold w-full">
            Got a tip about {e.name}? Check it
          </Link>
        </aside>
      </div>
      <p className="mt-14 text-[0.78rem] text-mute">ORO shows no prices and makes no recommendations. Information only.</p>
    </div>
  );
}

export default function CompanyPage({ params }: PageProps<"/s/[symbol]">) {
  return (
    <Suspense fallback={<div className="frame min-h-[100svh] pt-40" aria-busy="true" />}>
      <CompanyPageBody params={params} />
    </Suspense>
  );
}
