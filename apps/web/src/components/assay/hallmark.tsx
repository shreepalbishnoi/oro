"use client";

import { useEffect, useRef } from "react";
import { gsap, reduced } from "@/lib/gsap";
import type { RiskBand } from "@/lib/engine/types";
import { RISK } from "./meta";

/**
 * ORO's hallmark: a struck cartouche carrying Karat, risk band and date code,
 * the way an assay office marks tested gold. Lands with a stamp animation.
 */
export function Hallmark({ karat, risk, date = new Date(), size = 132, animate = true }: { karat: number; risk: RiskBand; date?: Date; size?: number; animate?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const r = RISK[risk];
  // Date code in IST so server and browser always agree.
  const code = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "2-digit" }).format(date).replace(/\//g, "·");

  useEffect(() => {
    if (!animate || !ref.current || reduced()) return;
    const tl = gsap.timeline();
    tl.fromTo(ref.current, { scale: 2.4, rotate: -18, opacity: 0, filter: "blur(6px)" }, { scale: 1, rotate: -6, opacity: 1, filter: "blur(0px)", duration: 0.55, ease: "stamp" });
    tl.fromTo(ref.current.querySelector(".hm-flash"), { opacity: 0.9, scale: 0.6 }, { opacity: 0, scale: 1.6, duration: 0.7, ease: "power2.out", transformOrigin: "50% 50%" }, "<0.38");
    return () => {
      tl.kill();
    };
  }, [animate, karat, risk]);

  return (
    <svg ref={ref} viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={`ORO hallmark: ${karat} karat, ${r.label}`} style={{ transform: "rotate(-6deg)" }}>
      <defs>
        <linearGradient id="hm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--gold-soft)" />
          <stop offset="55%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="var(--gold-deep)" />
        </linearGradient>
        <path id="hm-arc" d="M 22 70 A 48 48 0 0 1 118 70" />
        <path id="hm-arc2" d="M 26 76 A 44 44 0 0 0 114 76" />
      </defs>
      <circle className="hm-flash" cx="70" cy="70" r="64" fill="var(--gold)" opacity="0" />
      <circle cx="70" cy="70" r="64" fill="none" stroke="url(#hm-g)" strokeWidth="2.5" />
      <circle cx="70" cy="70" r="57" fill="color-mix(in oklab, var(--ink) 80%, transparent)" stroke="url(#hm-g)" strokeWidth="1" strokeDasharray="1.5 3" />
      <text fill="var(--gold)" fontFamily="var(--font-geist-mono)" fontSize="8.5" letterSpacing="3.2">
        <textPath href="#hm-arc" startOffset="50%" textAnchor="middle">ORO · ASSAYED</textPath>
      </text>
      <text fill={r.color} fontFamily="var(--font-geist-mono)" fontSize="8" letterSpacing="2.4">
        <textPath href="#hm-arc2" startOffset="50%" textAnchor="middle">{r.label.toUpperCase()}</textPath>
      </text>
      <text x="70" y="82" textAnchor="middle" fill="url(#hm-g)" fontFamily="var(--font-geist-mono)" fontWeight="600" fontSize="34" letterSpacing="-1">
        {karat}
        <tspan fontSize="13" dx="2" dy="-15" letterSpacing="1">KT</tspan>
      </text>
      <text x="70" y="96" textAnchor="middle" fill="var(--paper-dim)" fontFamily="var(--font-geist-mono)" fontSize="7" letterSpacing="1.5">
        {code}
      </text>
    </svg>
  );
}
