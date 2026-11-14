"use client";

import { useRef } from "react";
import { NOISE_LINES } from "@/lib/fixtures/tips";
import { gsap, reduced, useGSAP } from "@/lib/gsap";
import { ChapterHead } from "./chapter-head";

// Deterministic scatter so server and client agree.
const SPOTS = NOISE_LINES.map((t, i) => {
  const r = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const q = (v: number) => Math.round(v * 10) / 10;
  return { t, left: q(4 + r(1) * 82), top: q(4 + r(2) * 88), speed: q(0.4 + r(3) * 1.4), rot: q((r(4) - 0.5) * 10), tone: i % 3 };
});

const TRUTHS = [
  ["No stock can promise a fixed return.", "Anyone who promises one is breaking SEBI's rules."],
  ["SEBI never recommends stocks.", "A tip that says “SEBI approved” is false, every time."],
  ["Real company news is filed with the exchange first.", "If there's no filing, it's still a rumour."],
];

/** Chat-app skins for the drifting messages: WhatsApp received, WhatsApp sent, Telegram. */
const SKIN = [
  { bg: "#202c33", fg: "#e9edef", time: "#8696a0", corner: "rounded-tl-sm" },
  { bg: "#005c4b", fg: "#e9edef", time: "#8bb8ad", corner: "rounded-tr-sm" },
  { bg: "#2b5278", fg: "#ffffff", time: "#9cc2e6", corner: "rounded-bl-sm" },
];

/** Chapter 02: the storm of forwards. Bubbles drift at different depths as you scroll. */
export function Noise() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.utils.toArray<HTMLElement>(".noise-bubble").forEach((el) => {
        const speed = Number(el.dataset.speed);
        gsap.fromTo(
          el,
          { y: 160 * speed, opacity: 0 },
          {
            y: -260 * speed,
            opacity: 1,
            ease: "none",
            scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 0.6 },
          },
        );
      });
      gsap.from(".truth-row", {
        opacity: 0,
        x: -30,
        duration: 1,
        ease: "molten",
        stagger: 0.12,
        scrollTrigger: { trigger: ".truths", start: "top 80%", once: true },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="noise" data-chapter="noise" className="relative overflow-hidden py-[22svh]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {SPOTS.map((s, i) => (
          <span
            key={i}
            data-speed={s.speed}
            className={`noise-bubble absolute flex max-w-[16rem] items-end gap-2 rounded-xl px-2.5 py-1.5 whitespace-nowrap shadow-[0_2px_6px_rgb(0_0_0/0.35)] ${SKIN[s.tone].corner}`}
            style={{ left: `${s.left}%`, top: `${s.top}%`, rotate: `${s.rot}deg`, background: SKIN[s.tone].bg, color: SKIN[s.tone].fg, fontSize: `${0.74 + s.speed * 0.08}rem`, opacity: 0.9 }}
          >
            {s.t}
            <span className="text-[0.62rem] leading-none" style={{ color: SKIN[s.tone].time }}>
              {`${9 + (i % 4)}:${String((i * 7) % 60).padStart(2, "0")}`}
            </span>
          </span>
        ))}
      </div>

      <div className="frame relative">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-ink/55 p-6 backdrop-blur-md sm:p-10">
          <ChapterHead
            align="center"
            title={
              <>
                Most tips are written <span className="display-italic text-red">to make you hurry.</span>
              </>
            }
            lede="“Sure shot”, “operator news”, “only today”. The rush is the trick: it stops you from checking."
          />
          <ul className="truths mx-auto mt-12 max-w-2xl divide-y divide-line border-y border-line">
            {TRUTHS.map(([a, b]) => (
              <li key={a} className="truth-row grid gap-1 py-5 sm:grid-cols-[1fr_1.1fr] sm:gap-8">
                <p className="font-medium text-paper">{a}</p>
                <p className="text-[0.95rem] text-paper-dim">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
