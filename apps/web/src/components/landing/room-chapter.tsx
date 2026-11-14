"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowRight, CircleCheck, OctagonAlert, XCircle } from "lucide-react";
import { LandingSankey, LandingShock } from "./lazy";
import { STORIES } from "@/lib/fixtures/room";
import { exposureOf, inr } from "@/lib/room/compute";
import { gsap, reduced, useGSAP } from "@/lib/gsap";
import { ChapterHead } from "./chapter-head";

const SINCE = ["kav-order", "nir-pledge", "sur-denial"].map((id) => STORIES.find((s) => s.id === id)!);
const ICON = { high: OctagonAlert, medium: CircleCheck, low: CircleCheck };

/** Room: the lens opens onto a portfolio. */
export function RoomChapter() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".rm-panel", { opacity: 0, y: 70, duration: 1.2, ease: "molten", stagger: 0.14, scrollTrigger: { trigger: ".rm-grid", start: "top 80%", once: true } });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="room" data-chapter="room" className="relative py-[20svh]">
      <div className="frame">
        <ChapterHead
          align="center"
          title={
            <>
              News about what you own. <span className="display-italic text-molten">Nothing else.</span>
            </>
          }
          lede="Add your CDSL, NSDL or CAMS statement once. Room looks inside your mutual funds too, then shows only filings about companies your money is in, and how many rupees each one touches."
        />

        <div className="rm-grid mt-16 grid gap-5 lg:grid-cols-[1fr_1.35fr]">
          <article className="rm-panel glass rounded-[2rem] p-6">
            <p className="display text-[1.7rem] leading-tight">Since 4 Nov: 3 updates, 1 red flag.</p>
            <p className="mt-1 text-[0.85rem] text-mute">Demo portfolio</p>
            <ul className="mt-5 space-y-3">
              {SINCE.map((s) => {
                const x = exposureOf(s.symbol);
                const Icon = s.kind === "rumour" ? XCircle : ICON[s.severity];
                const color = s.severity === "high" ? "var(--red)" : "var(--green)";
                return (
                  <li key={s.id} className="rounded-2xl border border-line bg-ink-1/70 p-3.5">
                    <p className="flex items-start gap-2.5 text-[0.95rem] leading-snug text-paper">
                      <Icon className="mt-0.5 size-4 shrink-0" style={{ color }} aria-hidden="true" />
                      {s.headline}
                    </p>
                    <p className="mt-1.5 pl-6.5 font-mono text-[0.7rem] text-mute">
                      {s.source} · {x ? `${inr(x.total, { compact: true })} of yours` : ""}
                      {x && x.direct === 0 ? " · through funds" : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </article>

          <article className="rm-panel glass rounded-[2rem] p-6">
            <p className="display text-[1.7rem] leading-tight">
              You don&rsquo;t own Surya Fincap. <span className="text-gold">Your small-cap fund does.</span>
            </p>
            <p className="mt-1 text-[0.85rem] text-mute">X-ray traces every rupee through your funds. Demo portfolio, 7 Nov close.</p>
            <div className="mt-4">
              <LandingSankey />
            </div>
          </article>

          <article className="rm-panel glass rounded-[2rem] p-6 lg:col-span-2 lg:grid lg:grid-cols-[1fr_1.2fr] lg:gap-10">
            <div>
              <p className="display text-[1.7rem] leading-tight">What if a whole business group falls 10%?</p>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-paper-dim">
                Drag the slider to see the change in rupees across your shares and funds. It&rsquo;s arithmetic, not a forecast.
              </p>
              <Link href="/room" className="btn btn-gold mt-6">
                Try the demo portfolio <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-8 lg:mt-0">
              <LandingShock />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
