import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/site/page-head";

const DOCS = {
  privacy: {
    title: "Privacy notice",
    body: [
      ["What we collect", "Tips you check (personal details removed first; the text is kept only if you opt in), statements you upload (parsed in memory, never stored), the holdings derived from them (quantities encrypted), your settings and consents."],
      ["What we never do", "Sell data. Send portfolio data to analytics, advertisers or free AI tiers. Keep your CAS file or its password. Store your PAN (only a keyed hash)."],
      ["Your rights", "See, export, correct or delete your data at any time from Settings. Withdraw any consent with one tap. Under-18s may not use Room."],
      ["Breaches", "If personal data is ever exposed, we notify affected users and the Data Protection Board as the DPDP Rules require."],
    ],
  },
  terms: {
    title: "Terms of use",
    body: [
      ["What ORO is", "An information service that checks whether claims about listed companies match public records, and shows how news reaches your holdings."],
      ["What ORO is not", "Investment advice, research, a recommendation, or a broker. ORO does not tell you to buy, sell or hold anything, and does not predict prices."],
      ["Fair use", "Automated or bulk use, attempts to manipulate verdicts, and uploading content you have no right to share are not allowed."],
      ["Accuracy", "Verdicts can be wrong. Every one cites its sources so you can check them, and errors are corrected publicly."],
    ],
  },
  disclaimer: {
    title: "Disclaimer",
    body: [
      ["Not investment advice", "ORO is not registered with SEBI as an investment adviser or research analyst. Nothing on ORO is a recommendation to buy, sell or hold any security."],
      ["No prices", "ORO shows no live or delayed market prices. Values are as of the last close, computed from public end-of-day files."],
      ["Impact ranges", "Ranges describe how similar past events moved stocks. They are history, not a forecast, and are shown only with their sample size."],
      ["Disclosures", "Bulk deals, insider trades and pledges are shown exactly as filed. They do not prove wrongdoing."],
    ],
  },
  grievance: {
    title: "Grievance officer",
    body: [
      ["Contact", "The grievance officer's name, email and postal address will be published here before public launch, as the DPDP Act requires."],
      ["Response time", "We acknowledge within 48 hours and resolve within 30 days."],
      ["Escalation", "If you're not satisfied, you may approach the Data Protection Board of India."],
    ],
  },
} as const;
type Key = keyof typeof DOCS;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  return { title: DOCS[doc as Key]?.title ?? "Legal" };
}

async function LegalPageBody({ params }: Pick<PageProps<"/legal/[doc]">, "params">) {
  const { doc } = await params;
  if (!(doc in DOCS)) notFound();
  const d = DOCS[doc as Key];
  return (
    <div data-chapter="still">
      <PageHead eyebrow="Legal · draft for counsel review" title={d.title} />
      <section className="frame pb-28">
        <nav aria-label="Legal documents" className="mb-10 flex flex-wrap gap-2">
          {(Object.keys(DOCS) as Key[]).map((k) => (
            <Link key={k} href={`/legal/${k}`} aria-current={k === doc ? "page" : undefined} className={`rounded-full border px-3.5 py-1.5 text-[0.88rem] ${k === doc ? "border-gold bg-gold/10 text-gold" : "border-line text-paper-dim hover:text-paper"}`}>
              {DOCS[k].title}
            </Link>
          ))}
        </nav>
        <div className="max-w-3xl space-y-8">
          {d.body.map(([h, p]) => (
            <section key={h}>
              <h2 className="font-display text-[1.5rem] text-paper">{h}</h2>
              <p className="mt-2 text-[1.02rem] leading-relaxed text-paper-dim">{p}</p>
            </section>
          ))}
          <p className="rounded-2xl border border-gold/30 bg-gold/5 p-4 text-[0.88rem] text-paper-dim">This is a plain-language draft. The final text will be reviewed by a securities and privacy lawyer before public launch.</p>
        </div>
      </section>
    </div>
  );
}

export default function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  return (
    <Suspense fallback={<div className="frame min-h-[100svh] pt-40" aria-busy="true" />}>
      <LegalPageBody params={params} />
    </Suspense>
  );
}
