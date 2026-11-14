import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PageHead } from "@/components/site/page-head";

export const metadata: Metadata = { title: "Pricing", description: "Parakh is free. Room Plus and Family add Ask Room, unlimited checks and Guardian mode." };

const PLANS = [
  {
    name: "Free",
    price: "₹0",
    per: "forever",
    blurb: "Everything that's live today.",
    cta: ["Check a tip", "/parakh"],
    features: ["3 checks a day without an account, 10 with one", "Result cards to share", "Room for one portfolio: news, X-ray, what-if", "8 Ask Room questions a day", "Push alerts for red flags"],
  },
  {
    name: "Plus",
    price: "₹99",
    per: "a month",
    blurb: "For people who check often. Coming at launch.",
    cta: ["Join the waitlist", "/login"],
    featured: true,
    features: ["Unlimited checks", "Unlimited Ask Room", "Alerts on Telegram (coming)", "Results and dividend calendar (coming)"],
  },
  {
    name: "Family",
    price: "Soon",
    per: "priced at launch",
    blurb: "Up to five people, each with their consent. Coming later.",
    cta: ["Join the waitlist", "/login"],
    features: ["Everything in Plus", "One view of the family's holdings", "A heads-up when a parent checks a risky tip"],
  },
];

export default function PricingPage() {
  return (
    <div data-chapter="page">
      <PageHead
        eyebrow="Pricing"
        title={
          <>
            Free today. <span className="display-italic text-molten">Never paid for by brokers.</span>
          </>
        }
        lede="ORO takes no brokerage, commissions or paid placement, so nobody can pay to change a verdict. Paid plans open at launch."
      />
      <section className="frame grid gap-5 pb-28 md:grid-cols-3">
        {PLANS.map((p) => (
          <article key={p.name} className={`relative flex flex-col rounded-[1.75rem] p-7 ${p.featured ? "border-2 border-gold bg-ink-2 shadow-[0_30px_100px_-40px_var(--gold)]" : "glass"}`}>
            {p.featured && <span className="absolute -top-3 left-7 rounded-full bg-gold px-3 py-1 text-[0.8rem] font-medium text-ink">Planned</span>}
            <h2 className="text-[1.15rem] font-medium text-paper">{p.name}</h2>
            <p className="mt-4">
              <span className="display text-6xl">{p.price}</span> <span className="text-paper-dim">{p.per}</span>
            </p>
            <p className="mt-3 text-paper-dim">{p.blurb}</p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[0.95rem] text-paper">
                  <Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href={p.cta[1]} className={`btn mt-8 ${p.featured ? "btn-gold" : "btn-ghost"}`}>
              {p.cta[0]}
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
