import type { Metadata } from "next";
import { KaratCalculator } from "@/components/assay/karat-calculator";
import { PageHead } from "@/components/site/page-head";

export const metadata: Metadata = {
  title: "Methodology & Karat",
  description: "Exactly how ORO judges a claim, computes Karat, sets the risk band and keeps advice out. Published so anyone can check our work.",
};

const SECTIONS: [string, string[]][] = [
  ["1 · Personal details go first", ["Phone numbers, PAN, Aadhaar, emails, bank accounts and UPI ids are removed before anything is stored or sent to a model.", "Screenshots are processed and discarded. Tip text is kept only if you opt in; otherwise ORO keeps only a fingerprint, used to count how far a message has spread."]],
  ["2 · Scam rules run before any AI", ["Guaranteed returns, urgency, secrecy, fake registration, payment requests, look-alike links, .apk files, fake authority, surveillance lists, SME/low float and unusual volume.", "Each rule is severe or medium. Results stream to you in under two seconds."]],
  ["3 · Claims are judged one by one", ["Each factual claim is matched against BSE/NSE filings, SEBI records and tier-1 news using keyword and meaning search, filtered by company and weighted by recency.", "A claim is Supported or Conflicting only with a quoted line from a source. Unverified is a normal, honest answer."]],
  ["4 · Code checks every quote", ["The quote must exist, word for word, in the cited document. Every number in a Supported claim must appear in the quote. If not, the claim falls back to Unverified.", "Tip text can't instruct the system: it is treated as data, the judge has no tools, and output is schema-only."]],
  ["5 · Advice is filtered out", ["Every sentence ORO writes passes a filter for buy/sell/hold language, targets, stop-losses and their Hindi and Hinglish forms. A match blocks the sentence.", "ORO answers “is this true?”. It never answers “should I?”."]],
  ["6 · Mistakes are corrected in public", ["Anyone can report a wrong verdict. A person reviews it; if it was wrong, the verdict changes, the correction is logged publicly, and everyone who saw it is told."]],
];

export default function MethodologyPage() {
  return (
    <div data-chapter="assay">
      <PageHead
        eyebrow="Methodology · karat-0.1"
        title={
          <>
            How ORO <span className="display-italic text-molten">decides.</span>
          </>
        }
        lede="Every rule ORO applies and the exact formula behind the Karat score, so you can check our work."
      />
      <section className="frame pb-20" aria-labelledby="calc">
        <h2 id="calc" className="eyebrow mb-4">
          Karat calculator · runs the production formula
        </h2>
        <KaratCalculator />
        <pre className="mt-6 overflow-x-auto rounded-[1.25rem] border border-line bg-ink-1/80 p-5 font-mono text-[0.8rem] leading-7 text-paper-dim">{`base      = 12
evidence  = +3 per supported, −5 per conflicting (bounded ±9), × tier weight (1, 1, 0.7, 0.4)
source    = +3 filing or regulator origin, 0 tier-1 news, −3 unknown or anonymous
language  = −1 per hedge or missing attribution (max −3)
scam      = −2 per medium signal, −6 per severe signal
karat     = clamp(round(sum), 0, 24); 24 only if every checkable claim is supported by tier 1–2

risk band: High if any severe signal or a conflict on a material claim;
           Elevated if medium signals or most claims unverified; otherwise Low.
           Bands describe the information, never the stock.`}</pre>
      </section>
      <section className="frame grid gap-x-12 gap-y-10 pb-28 md:grid-cols-2">
        {SECTIONS.map(([t, ps]) => (
          <div key={t} className="border-t border-gold/30 pt-5">
            <h2 className="font-display text-[1.5rem] text-paper">{t}</h2>
            {ps.map((p) => (
              <p key={p} className="mt-3 text-[0.98rem] leading-relaxed text-paper-dim">
                {p}
              </p>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
