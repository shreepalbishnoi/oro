import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHead } from "@/components/site/page-head";
import { SCAMS } from "@/lib/fixtures/scams";

export const metadata: Metadata = {
  title: "Scam library",
  description: "How the most common Indian stock-market scams work, the tells that give them away, and what ORO checks.",
};

export default function ScamsPage() {
  return (
    <div data-chapter="page">
      <PageHead
        eyebrow="Scam library"
        title={
          <>
            Ten common stock scams, <span className="display-italic text-molten">and how to spot them.</span>
          </>
        }
        lede="How each one works, step by step. The examples are made up; the tricks are real."
      />
      <section className="frame pb-28">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCAMS.map((s, i) => (
            <li key={s.slug}>
              <Link href={`/scams/${s.slug}`} className="glass group flex h-full flex-col rounded-[1.5rem] p-6 transition hover:-translate-y-1 hover:border-gold/40">
                <span className="font-mono text-[0.72rem] text-gold">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="display mt-3 text-[1.6rem] leading-tight">{s.title}</h2>
                <p className="mt-3 flex-1 text-[0.92rem] leading-relaxed text-paper-dim">{s.hook}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-[0.85rem] text-gold">
                  Take it apart <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
