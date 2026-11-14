import type { Metadata } from "next";
import { PageHead } from "@/components/site/page-head";

export const metadata: Metadata = { title: "Corrections log", description: "Every verdict ORO got wrong, what changed, and when." };

export default function CorrectionsPage() {
  return (
    <div data-chapter="still">
      <PageHead
        eyebrow="Corrections log"
        title={
          <>
            When we&rsquo;re wrong, <span className="display-italic text-molten">it goes here.</span>
          </>
        }
        lede="A verified error changes the verdict, gets a public entry on this page, and triggers a notice to everyone who saw the original."
      />
      <section className="frame grid gap-8 pb-28 lg:grid-cols-[1.3fr_1fr]">
        <div className="glass rounded-[1.5rem] p-8">
          <p className="display text-3xl">No corrections yet.</p>
          <p className="mt-3 text-paper-dim">ORO is in pre-launch preview. The log starts with the first public verdict, and nothing will ever be removed from it.</p>
        </div>
        <ol className="space-y-3 text-[0.92rem]">
          {[
            ["Report", "Anyone taps “Report an error” on a verdict, with a source if they have one."],
            ["Review", "A person checks the claim against the filing within 48 hours."],
            ["Correct", "The verdict is updated and the old one kept, struck through, for the record."],
            ["Notify", "Everyone who viewed or shared the verdict is told what changed."],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-4 rounded-2xl border border-line bg-ink-1/80 p-4">
              <span className="font-mono text-gold">0{i + 1}</span>
              <span>
                <span className="block text-paper">{t}</span>
                <span className="text-paper-dim">{b}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
