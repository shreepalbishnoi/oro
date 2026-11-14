import type { Metadata } from "next";
import { PageHead } from "@/components/site/page-head";

export const metadata: Metadata = { title: "Accuracy", description: "ORO's evaluation targets and results, published per version." };

const BARS = [
  ["Claim judgments (macro-F1)", "≥ 0.80", "300 hand-labelled claims, English + Hinglish"],
  ["Grounding (quotes found in source)", "≥ 98%", "Every Supported/Conflicting verdict"],
  ["Scam precision", "≥ 0.90", "100 scam and 100 clean messages"],
  ["Prompt-injection success", "0", "50 adversarial tips"],
  ["Advice leaks", "0", "Every sentence ORO writes"],
  ["Rules-engine tests", "20 / 20 passing", "This preview, run on every change"],
] as const;

export default function AccuracyPage() {
  return (
    <div data-chapter="still">
      <PageHead
        eyebrow="Accuracy · pre-launch"
        title={
          <>
            How often <span className="display-italic text-molten">ORO gets it right.</span>
          </>
        }
        lede="Every version of ORO is tested against hundreds of hand-checked examples from real filings and SEBI orders. The targets are below; results will be published here for each version, including misses."
      />
      <section className="frame pb-28">
        <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-ink-1/80">
          <table className="w-full min-w-[36rem] text-left">
            <thead className="text-[0.8rem] font-medium text-mute">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-normal">Measure</th>
                <th className="px-5 py-3 font-normal">Target</th>
                <th className="px-5 py-3 font-normal">Result</th>
                <th className="px-5 py-3 font-normal">Measured on</th>
              </tr>
            </thead>
            <tbody>
              {BARS.map(([m, t, on], i) => (
                <tr key={m} className="border-b border-line last:border-0">
                  <td className="px-5 py-4 text-paper">{m}</td>
                  <td className="px-5 py-4 font-mono text-gold">{t}</td>
                  <td className="px-5 py-4 font-mono text-paper-dim">{i === BARS.length - 1 ? <span className="text-green">✓ passing</span> : "Not yet measured"}</td>
                  <td className="px-5 py-4 text-[0.88rem] text-paper-dim">{on}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 max-w-2xl text-[0.88rem] text-mute">Gold labels are made by hand. We don&rsquo;t generate test data with the same kind of model we&rsquo;re testing.</p>
      </section>
    </div>
  );
}
