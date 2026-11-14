import type { Metadata } from "next";
import Link from "next/link";
import { ScamDeck } from "@/components/play/scam-deck";
import { PageHead } from "@/components/site/page-head";
import { DECK } from "@/lib/fixtures/scam-deck";

export const metadata: Metadata = {
  title: "Scam quiz",
  description: `${DECK.length} real-pattern stock tips. Swipe scam or legit and learn the tells. Then challenge your family group.`,
};

export default function PlayPage() {
  return (
    <div data-chapter="play">
      <PageHead
        eyebrow="Spot the Scam · full deck"
        title={
          <>
            {DECK.length} forwards. <span className="display-italic text-molten">Which are scams?</span>
          </>
        }
        lede="The tricks are real; the companies and senders are made up. Swipe left for scam, right for real, and see what gives each one away."
      />
      <section className="frame grid gap-14 pb-28 lg:grid-cols-[1fr_0.8fr]">
        <ScamDeck />
        <aside className="space-y-5 text-paper-dim">
          <h2 className="eyebrow">The tells, in one place</h2>
          <ul className="space-y-3 text-[0.95rem]">
            {[
              ["Guaranteed or “assured” returns", "No listed stock or mutual fund can promise a return."],
              ["A clock", "“Only today”, “before 3 pm”, “last 20 seats”."],
              ["Secrets", "“Operator news”, “insider tip”, “don't share”."],
              ["Borrowed authority", "“SEBI approved”, TV logos, celebrity faces."],
              ["Money to a person", "Personal UPI ids, “grey-market agents”, deposits."],
              ["Links that hide", "Shorteners, look-alike broker domains, .apk files."],
            ].map(([t, b]) => (
              <li key={t} className="rounded-2xl border border-line bg-ink-1/70 p-4">
                <p className="font-medium text-paper">{t}</p>
                <p className="mt-1 text-[0.88rem]">{b}</p>
              </li>
            ))}
          </ul>
          <p className="text-[0.9rem]">
            Got a real one?{" "}
            <Link href="/parakh" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
              Check it with Parakh
            </Link>{" "}
            or browse the{" "}
            <Link href="/scams" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
              scam library
            </Link>
            .
          </p>
        </aside>
      </section>
    </div>
  );
}
