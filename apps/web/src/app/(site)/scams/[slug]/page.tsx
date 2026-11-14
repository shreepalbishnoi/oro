import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SCAMS } from "@/lib/fixtures/scams";

export function generateStaticParams() {
  return SCAMS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/scams/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = SCAMS.find((x) => x.slug === slug);
  return s ? { title: s.title, description: s.hook } : { title: "Scam library" };
}

async function ScamPageBody({ params }: Pick<PageProps<"/scams/[slug]">, "params">) {
  const { slug } = await params;
  const i = SCAMS.findIndex((x) => x.slug === slug);
  if (i < 0) notFound();
  const s = SCAMS[i];
  const next = SCAMS[(i + 1) % SCAMS.length];

  return (
    <article data-chapter="page" className="frame pt-36 pb-28 sm:pt-44">
      <Link href="/scams" className="inline-flex items-center gap-1.5 text-[0.85rem] text-paper-dim hover:text-paper">
        <ArrowLeft className="size-4" aria-hidden="true" /> Scam library
      </Link>
      <h1 className="display mt-6 max-w-4xl text-[clamp(2.6rem,6.5vw,5.2rem)] leading-[0.98] tracking-[-0.028em]">{s.title}</h1>
      <p className="mt-5 max-w-2xl text-[1.12rem] leading-relaxed text-paper-dim">{s.hook}</p>

      <figure className="mt-10 max-w-xl rounded-[1.5rem] rounded-tl-md border border-red/30 bg-ink-2 p-5">
        <figcaption className="text-[0.8rem] font-medium text-red">What it looks like (invented example)</figcaption>
        <p className="mt-2 text-[1.05rem] leading-relaxed text-paper">{s.example}</p>
      </figure>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="how">
          <h2 id="how" className="eyebrow">
            How it works
          </h2>
          <ol className="mt-5 space-y-5">
            {s.steps.map((step, k) => (
              <li key={k} className="flex gap-4">
                <span className="display w-8 shrink-0 text-3xl leading-none text-gold">{k + 1}</span>
                <p className="pt-1 text-[1.02rem] leading-relaxed text-paper">{step}</p>
              </li>
            ))}
          </ol>
        </section>
        <aside className="space-y-5">
          <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5" aria-labelledby="tells">
            <h2 id="tells" className="eyebrow">
              The tells
            </h2>
            <ul className="mt-3 space-y-2 text-paper">
              {s.tells.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-red" aria-hidden="true">
                    ✕
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-[1.5rem] border border-gold/30 bg-ink-1/80 p-5" aria-labelledby="checks">
            <h2 id="checks" className="eyebrow">
              What Parakh checks
            </h2>
            <ul className="mt-3 space-y-2 text-paper">
              {s.oroChecks.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-gold" aria-hidden="true">
                    ◆
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5 text-[0.9rem] text-paper-dim" aria-labelledby="hit">
            <h2 id="hit" className="eyebrow">
              If it already happened
            </h2>
            <p className="mt-3">Report cyber fraud on the national helpline 1930 or cybercrime.gov.in, and complaints about market intermediaries on SEBI&rsquo;s SCORES portal. Act fast; banks can sometimes freeze recent transfers.</p>
          </section>
        </aside>
      </div>

      <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
        <Link href="/parakh" className="btn btn-gold">
          Check a message like this
        </Link>
        <Link href={`/scams/${next.slug}`} className="group inline-flex items-center gap-2 text-paper-dim hover:text-paper">
          Next: <span className="text-paper">{next.title}</span> <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export default function ScamPage({ params }: PageProps<"/scams/[slug]">) {
  return (
    <Suspense fallback={<div className="frame min-h-[100svh] pt-40" aria-busy="true" />}>
      <ScamPageBody params={params} />
    </Suspense>
  );
}
