import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Flag, Gauge, MessageCircleQuestion, Radio, ScanEye, ShieldCheck, Sparkles } from "lucide-react";
import { XraySankey } from "@/components/room/xray-sankey";
import { PageHead } from "@/components/site/page-head";

export const metadata: Metadata = {
  title: "Room: your portfolio, verified",
  description: "One private place for all your portfolios. Only verified news that reaches your holdings, sized in rupees, with look-through exposure into every fund.",
};

const FEATURES = [
  [Sparkles, "News", "Filings about companies you own, newest first, with how much of your money each one touches. Filter to red flags or rumours."],
  [Flag, "Red flags", "Promoter pledges, auditor exits, rating cuts, SEBI orders and late results, as soon as they're filed."],
  [Radio, "Rumours", "When a company tells the exchange a news report is false, you see it next to your holding."],
  [ScanEye, "X-ray", "The companies inside your mutual funds, added to your own shares. “You don't own it, but ₹12,400 of your money is in it through 3 funds.”"],
  [Gauge, "What if", "Drag a slider: if a business group or industry fell 10%, how many rupees would you lose? Arithmetic, not a forecast."],
  [MessageCircleQuestion, "Ask Room", "Ask about your holdings in plain words. Answers come from filings, with the sources listed, and never say what to buy or sell."],
] as const;

const STEPS = [
  ["Get your statement", "Ask CDSL, NSDL, CAMS or KFintech for a Consolidated Account Statement (CAS). It comes by email, locked with your PAN. A broker's holdings CSV also works."],
  ["Upload it once", "ORO reads it in memory. The file and its password are never saved."],
  ["Open your Room", "From then on, every new filing about a company you own shows up here."],
];

export default function RoomInfoPage() {
  return (
    <div data-chapter="vault">
      <PageHead
        eyebrow="Room · your strongroom"
        title={
          <>
            News about what you own. <span className="display-italic text-molten">Nothing else.</span>
          </>
        }
        lede="Room puts your shares and mutual funds in one private place, looks inside every fund, and shows only the filings that affect your money."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/room" className="btn btn-gold">
            Try the demo portfolio <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/pricing" className="btn btn-ghost">
            Plans
          </Link>
        </div>
      </PageHead>

      <section className="frame pb-20">
        <div className="glass rounded-[2rem] p-5 sm:p-8">
          <p className="text-[0.95rem] text-paper-dim">Where the demo portfolio&rsquo;s money goes. Hover a company to trace it.</p>
          <div className="mt-4">
            <XraySankey height={560} labelSize={15} />
          </div>
        </div>
      </section>

      <section className="frame pb-20" aria-labelledby="features">
        <h2 id="features" className="display mb-8 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-tight">
          What you get
        </h2>
        <ul className="grid gap-px overflow-hidden rounded-[2rem] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([Icon, t, b]) => (
            <li key={t} className="bg-ink/85 p-6 backdrop-blur-md">
              <Icon className="size-5 text-gold" aria-hidden="true" />
              <h3 className="mt-4 text-[1.1rem] font-medium text-paper">{t}</h3>
              <p className="mt-2 text-[0.92rem] leading-relaxed text-paper-dim">{b}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="frame grid gap-10 pb-28 lg:grid-cols-[1fr_1fr]" aria-labelledby="link">
        <div>
          <h2 id="link" className="display text-[clamp(2rem,4vw,3.2rem)] leading-tight">
            Three steps to set up. <span className="text-gold">Your statement is never saved.</span>
          </h2>
          <p className="mt-4 flex items-start gap-2 text-paper-dim">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-green" aria-hidden="true" />
            Your PAN is stored only as a one-way code, and holding quantities are encrypted. Your portfolio is never sent to analytics or to free AI services.
          </p>
        </div>
        <ol className="space-y-4">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="flex gap-4 rounded-2xl border border-line bg-ink-1/80 p-5">
              <span className="display text-3xl leading-none text-gold">{i + 1}</span>
              <div>
                <p className="font-medium text-paper">{t}</p>
                <p className="mt-1 text-[0.9rem] text-paper-dim">{b}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
