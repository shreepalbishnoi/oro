"use client";

import { useRef } from "react";
import { FileCheck2, Forward, TrendingDown, TrendingUp } from "lucide-react";
import { gsap, reduced, useGSAP } from "@/lib/gsap";

/**
 * Chapter 03, pinned: one forward splits into the bear story and the bull story
 * (the field pulls red and green apart behind it). Then the gold seam draws
 * down the middle and the record lands.
 */
export function Split() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (reduced()) return;
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.8 },
      });
      tl.fromTo(".sp-forward", { scale: 1, y: 0 }, { scale: 0.86, y: "-22svh", duration: 1 })
        .fromTo(".sp-bear", { xPercent: -30, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 1 }, 0.3)
        .fromTo(".sp-bull", { xPercent: 30, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 1 }, 0.3)
        .fromTo(".sp-seam", { scaleY: 0 }, { scaleY: 1, duration: 1 }, 1.3)
        .fromTo(".sp-record", { opacity: 0, y: 40, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.8 }, 2.0)
        .to(".sp-bear, .sp-bull", { opacity: window.innerWidth < 640 ? 0.1 : 0.35, duration: 0.6 }, 2.1)
        .fromTo(".sp-coda", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, 2.9)
        .to({}, { duration: 0.5 });
    },
    { scope: root },
  );

  return (
    <section ref={root} data-chapter="split" className="relative h-[340svh]" aria-labelledby="split-title">
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div className="frame relative grid h-full grid-rows-[auto_1fr_auto] py-[12svh]">
          <div className="text-center">
            <h2 id="split-title" className="display text-[clamp(1.6rem,3vw,2.4rem)] leading-tight text-paper">
              One message. <span className="display-italic text-gold">Two ways to read it.</span>
            </h2>
          </div>

          <div className="relative grid items-center">
            <figure className="sp-forward motion-reduce:-translate-y-[22svh] mx-auto w-full max-w-md rounded-xl rounded-tl-sm bg-[#202c33] px-3.5 pt-2 pb-1.5 text-[#e9edef] shadow-[0_8px_30px_-6px_rgb(0_0_0/0.6)]">
              <figcaption className="flex items-center gap-1 text-[0.78rem] text-[#8696a0] italic">
                <Forward className="size-3.5" aria-hidden="true" /> Forwarded many times
              </figcaption>
              <p className="mt-1 text-[1.08rem] leading-snug">🚀 KAVERI POWER ko ₹4,200 crore ka order mila hai, kal announcement hoga!</p>
              <p className="mt-0.5 text-right text-[0.68rem] text-[#8696a0]">10:42</p>
            </figure>

            <div className="pointer-events-none absolute inset-x-0 top-[38%] grid -translate-y-1/2 grid-cols-2 gap-5 sm:top-1/2 sm:gap-16 lg:gap-56">
              <blockquote className="sp-bear text-right">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1 text-[0.85rem] font-medium text-red">
                  <TrendingDown className="size-4" aria-hidden="true" /> Bear story
                </p>
                <p className="display mt-3 text-[clamp(1.05rem,3.6vw,3rem)] leading-[1.02] text-paper [text-shadow:0_2px_24px_rgba(7,10,17,0.9)]">“Too good to be true. Somebody&rsquo;s pumping it.”</p>
              </blockquote>
              <blockquote className="sp-bull">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1 text-[0.85rem] font-medium text-green">
                  <TrendingUp className="size-4" aria-hidden="true" /> Bull story
                </p>
                <p className="display mt-3 text-[clamp(1.05rem,3.6vw,3rem)] leading-[1.02] text-paper [text-shadow:0_2px_24px_rgba(7,10,17,0.9)]">“₹4,200 crore! That&rsquo;s a whole year of revenue.”</p>
              </blockquote>
            </div>

            <span className="sp-seam pointer-events-none absolute top-[8%] bottom-[8%] left-1/2 w-px origin-top -translate-x-1/2 bg-linear-to-b from-transparent via-gold to-transparent shadow-[0_0_24px_var(--gold)]" aria-hidden="true" />

            <article className="sp-record absolute inset-x-0 bottom-[2%] mx-auto w-full max-w-lg rounded-[1.5rem] border border-gold/40 bg-ink/90 p-5 shadow-[0_0_80px_-20px_var(--gold)] backdrop-blur-md">
              <p className="flex items-center gap-2 text-[0.85rem] font-medium text-gold">
                <FileCheck2 className="size-4" aria-hidden="true" /> What the company told NSE on 7 Nov
              </p>
              <p className="mt-3 font-mono text-[0.9rem] leading-relaxed text-paper">“…a 400 kV substation package valued at Rs 420 crore…”</p>
              <p className="display mt-3 text-[1.6rem] leading-tight">
                The order is real. <span className="display-italic text-gold">The number was inflated 10×.</span>
              </p>
            </article>
          </div>

          <p className="sp-coda display mx-auto max-w-2xl text-center text-[clamp(1.4rem,2.6vw,2.2rem)] leading-tight text-paper">
            Neither story was right. <span className="text-gold">The filing was.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
