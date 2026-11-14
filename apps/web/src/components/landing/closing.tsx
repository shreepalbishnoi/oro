import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { LandingDeck } from "./lazy";
import { LANDING_DECK } from "@/lib/fixtures/scam-deck";
import { SplitReveal } from "@/components/motion/split-reveal";
import { Magnetic } from "@/components/motion/magnetic";
import { ChapterHead } from "./chapter-head";

/** The five-card scam quiz. */
export function PlayChapter() {
  return (
    <section id="play" data-chapter="play" className="relative py-[18svh]">
      <div className="frame grid items-center gap-14 lg:grid-cols-[1fr_1fr]">
        <ChapterHead
          title={
            <>
              Five forwards. <span className="display-italic text-molten">Which are scams?</span>
            </>
          }
          lede="Swipe left for scam, right for real. Each card then shows the giveaway."
        />
        <LandingDeck ids={LANDING_DECK} />
      </div>
    </section>
  );
}

const RULES: [string, string][] = [
  ["We never tell you what to buy or sell.", "ORO checks facts. It doesn't give tips, targets or predictions, and a filter checks every sentence it writes."],
  ["Every verdict shows its source.", "A claim is marked true or false only when we can quote the filing. If we can't, it says Unverified."],
  ["The score is public.", "Karat is a published formula, so you can recalculate any score yourself."],
  ["Your statement stays private.", "Statements are read in memory and never saved. Delete everything with one tap."],
  ["Nobody pays us to say anything.", "We take no brokerage, commissions or sponsored stories."],
  ["Mistakes are fixed in public.", "If a verdict was wrong, we correct it, log it, and tell everyone who saw it."],
];

/** The rules ORO holds itself to. */
export function Rules() {
  return (
    <section id="rules" data-chapter="rules" className="relative py-[18svh]">
      <div className="frame">
        <ChapterHead
          title={
            <>
              Six rules <span className="display-italic text-molten">we don&rsquo;t break.</span>
            </>
          }
        />
        <dl className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {RULES.map(([t, b]) => (
            <div key={t} className="border-t border-gold/30 pt-5">
              <dt className="text-[1.1rem] font-medium text-paper">{t}</dt>
              <dd className="mt-2 text-[0.95rem] leading-relaxed text-paper-dim">{b}</dd>
            </div>
          ))}
        </dl>
        <Link href="/methodology" className="mt-12 inline-flex items-center gap-1 text-[0.95rem] text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
          How the Karat score is calculated <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/** Closing call: the forms fuse back into the mark. */
export function Cta() {
  return (
    <section id="cta" data-chapter="cta" className="relative flex min-h-[110svh] items-end pb-[12svh]">
      <div className="frame text-center">
        <SplitReveal as="h2" className="display display-tight mx-auto max-w-5xl text-[clamp(3rem,8.4vw,7.6rem)]">
          Got a tip today? <span className="display-italic text-molten">Check it.</span>
        </SplitReveal>
        <p className="mx-auto mt-6 max-w-xl text-[1.1rem] text-paper-dim">Paste it in. It&rsquo;s free and takes a few seconds.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Magnetic>
            <Link href="/parakh" className="btn btn-gold h-14 px-7 text-base">
              Check a tip <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
          </Magnetic>
          <Link href="/room" className="btn btn-ghost h-14 px-7 text-base">
            Try the demo portfolio
          </Link>
        </div>
      </div>
    </section>
  );
}
