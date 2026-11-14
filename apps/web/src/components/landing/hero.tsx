"use client";

import { useEffect, useRef } from "react";
import { LiveAssay } from "@/components/assay/live-assay";
import { TipInput } from "@/components/assay/tip-input";
import { useAssay } from "@/components/assay/use-assay";
import { gsap, reduced, useGSAP } from "@/lib/gsap";
import { scrollToTarget } from "@/components/motion/smooth-scroll";
import { getFieldGeometry, getFieldLens, LENS_R } from "@/lib/field-bus";

/** Where each word sits on the mark, in the shader's mark space (see `fields()` in shader.ts). */
const WORDS = [
  { text: "Bear story", at: (sep: number, lift: number) => [-sep, lift + 0.34], size: 1, color: "rgb(7 10 17 / 0.82)" },
  { text: "Truth between", at: (sep: number) => [0.006 * (1 - sep), 0.008 * (1 - sep)], size: 0.8, color: "var(--gold)" },
  { text: "Bull story", at: (sep: number, lift: number) => [sep - 0.005, -lift - 0.31], size: 1, color: "rgb(7 10 17 / 0.82)" },
] as const;
const ZOOM = 1.45; // close to the loupe's own magnification near its centre

/**
 * The words are written on the mark but hidden: they show only inside the cursor loupe,
 * masked to the same circle the shader magnifies. Red reads "Bear story", green "Bull story",
 * the gold-rimmed eye between them "Truth between".
 */
function LensWords() {
  const wrap = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = wrap.current;
      const g = getFieldGeometry();
      if (!el || !layer.current || !g) return;
      const H = window.innerHeight;
      const Wd = window.innerWidth;
      const l = getFieldLens();
      const fade = Math.max(0, 1 - window.scrollY / (H * 0.4));
      const on = l.on * fade;
      el.style.opacity = on.toFixed(3);
      if (on < 0.01) return;
      const mx = l.x * H + Wd / 2;
      const my = H / 2 - l.y * H;
      const r = LENS_R * H * 0.93;
      const mask = `radial-gradient(circle ${r}px at ${mx}px ${my}px, #000 ${r - 2}px, transparent ${r}px)`;
      el.style.maskImage = mask;
      el.style.webkitMaskImage = mask;
      layer.current.style.transformOrigin = `${mx}px ${my}px`;
      WORDS.forEach((w, i) => {
        const s = words.current[i];
        if (!s) return;
        const [ax, ay] = w.at(g.sep, g.lift);
        const x = (g.cx + ax * g.scale) * H + Wd / 2;
        const y = H / 2 - (g.cy + ay * g.scale) * H;
        s.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        s.style.fontSize = `${0.04 * g.scale * H * w.size}px`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrap} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 opacity-0">
      <div ref={layer} className="absolute inset-0" style={{ transform: `scale(${ZOOM})` }}>
        {WORDS.map((w, i) => (
          <span
            key={w.text}
            ref={(n) => {
              words.current[i] = n;
            }}
            className="display-italic absolute top-0 left-0 font-display whitespace-nowrap"
            style={{ color: w.color, lineHeight: 1 }}
          >
            {w.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  const { state, run, reset } = useAssay();
  const root = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const busy = state.stage !== "idle" && state.stage !== "done" && state.stage !== "error";

  useGSAP(
    () => {
      if (reduced()) return;
      const tl = gsap.timeline({ defaults: { ease: "molten" } });
      tl.from(".hero-line", { yPercent: 115, rotate: 3, duration: 1.4, stagger: 0.12 }, 0.15)
        .from(".hero-fade", { opacity: 0, y: 24, duration: 1.1, stagger: 0.08 }, 0.7);
    },
    { scope: root },
  );

  return (
    <section ref={root} id="top" className="relative overflow-hidden">
      <div className="relative" data-chapter="hero">
      <LensWords />
      <div className="frame relative grid min-h-[100svh] grid-cols-1 items-center pt-[46vh] pb-16 sm:pt-[42vh] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pt-28">
        <div className="max-w-[40rem]">
          <h1 className="display display-tight text-[clamp(3rem,8vw,6.6rem)]">
            <span className="block overflow-hidden pb-[0.06em]">
              <span className="hero-line block">Before You Believe It,</span>
            </span>
            <span className="block overflow-hidden pb-[0.12em]">
              <span className="hero-line display-italic text-molten block pr-2">Verify It.</span>
            </span>
          </h1>

          <p className="hero-fade mt-6 max-w-xl text-[1.1rem] leading-relaxed text-paper-dim sm:text-[1.18rem]">
            Paste a stock tip from WhatsApp, Telegram or anywhere else. ORO checks it against stock exchange filings and SEBI records, and shows you which parts hold up.
          </p>

          <div className="hero-fade mt-8">
            <TipInput
              busy={busy}
              onSubmit={(t, k) => {
                run(t, k);
                requestAnimationFrame(() => resultRef.current && scrollToTarget(resultRef.current));
              }}
            />
          </div>

          <ul className="hero-fade mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.8rem] text-mute">
            <li>Free, no sign-up</li>
            <li aria-hidden="true">·</li>
            <li>Your phone number and PAN are removed first</li>
            <li aria-hidden="true">·</li>
            <li>Every answer links to its source</li>
          </ul>
        </div>
      </div>

      </div>

      <div ref={resultRef} className="frame scroll-mt-24" data-chapter={state.stage !== "idle" ? "assay" : undefined}>
        {state.stage !== "idle" && (
          <div className="glass mb-24 rounded-[2rem] p-5 sm:p-7">
            <LiveAssay state={state} onReset={reset} compact />
          </div>
        )}
      </div>


    </section>
  );
}
