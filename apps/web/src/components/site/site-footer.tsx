import Link from "next/link";
import { OroMark } from "@/components/brand/oro-mark";

const COLS = [
  { title: "Products", links: [["/parakh", "Parakh: check a tip"], ["/room-info", "Room: your portfolio"], ["/play", "Scam quiz"], ["/scams", "Scam library"], ["/pricing", "Pricing"]] },
  { title: "Trust", links: [["/methodology", "Methodology & Karat"], ["/accuracy", "Accuracy"], ["/corrections", "Corrections log"], ["/legal/disclaimer", "Disclaimer"]] },
  { title: "Legal", links: [["/legal/privacy", "Privacy"], ["/legal/terms", "Terms"], ["/legal/grievance", "Grievance officer"], ["/settings/data", "Export or delete data"]] },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-line bg-ink/80 backdrop-blur-sm" data-chapter="still">
      <div className="frame grid gap-12 py-16 md:grid-cols-[1.3fr_2fr]">
        <div>
          <OroMark className="h-16 w-auto" decorative />
          <p className="display mt-5 max-w-xs text-3xl leading-tight">Stock tips, checked against the records.</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-paper-dim">
            ORO checks whether claims about listed companies are true. It never tells anyone what to buy or sell.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {COLS.map((c) => (
            <div key={c.title}>
              <h2 className="eyebrow">{c.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {c.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="text-[0.92rem] text-paper-dim transition-colors hover:text-gold">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="frame flex flex-col gap-2 border-t border-line py-6 text-[0.78rem] text-mute sm:flex-row sm:items-center sm:justify-between">
        <p>Early preview. Companies and portfolios in the demos are made up.</p>
        <p>Values use the last closing price. ORO shows no live prices.</p>
      </div>
    </footer>
  );
}
