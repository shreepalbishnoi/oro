import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ParakhApp } from "@/components/assay/parakh-app";
import { PageHead } from "@/components/site/page-head";

export const metadata: Metadata = {
  title: "Parakh: check any stock tip",
  description: "Paste a WhatsApp forward, Telegram tip, headline or link. ORO checks every claim against exchange filings and SEBI records and flags scam patterns.",
};

const HOW = [
  ["Your details come out", "Phone numbers, PAN, Aadhaar, emails, bank and UPI ids are removed before anything else."],
  ["Scam patterns", "Promised returns, pressure to hurry, fake SEBI badges, odd links, requests for money."],
  ["The claims", "Each fact the message states about a company is pulled out on its own."],
  ["The evidence", "Each claim is looked up in BSE and NSE filings, SEBI records and major news."],
  ["The score", "A published formula turns all of that into a Karat score from 0 to 24."],
];

export default function ParakhPage() {
  return (
    <div data-chapter="assay">
      <PageHead
        eyebrow="Parakh · परख · to assay"
        title={
          <>
            Paste a tip. <span className="display-italic text-molten">See what holds up.</span>
          </>
        }
        lede="A WhatsApp forward, a Telegram call, a headline or a link about any Indian listed company. Your first three checks each day need no account."
      />
      <section className="frame pb-20">
        <div className="max-w-4xl">
          <Suspense fallback={<div className="glass h-56 animate-pulse rounded-[1.6rem]" aria-hidden="true" />}>
            <ParakhApp />
          </Suspense>
        </div>
      </section>

      <section className="frame pb-28" aria-labelledby="how">
        <h2 id="how" className="text-[1.25rem] font-medium text-paper">
          What happens when you press Check
        </h2>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-[1.5rem] border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {HOW.map(([t, b], i) => (
            <li key={t} className="bg-ink/85 p-5 backdrop-blur">
              <p className="font-mono text-[0.72rem] text-gold">0{i + 1}</p>
              <p className="mt-2 font-medium text-paper">{t}</p>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-paper-dim">{b}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[0.85rem] text-mute">
          On Android, add ORO to your home screen from the browser menu, then share any WhatsApp message straight to it. On iPhone, copy the message and use Paste.{" "}
          <Link href="/parakh/history" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
            Your past checks →
          </Link>
        </p>
      </section>
    </div>
  );
}
