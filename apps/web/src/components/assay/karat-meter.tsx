"use client";

import { RollingNumber } from "@/components/motion/rolling-digits";

/** Karat gauge: 24 ticks on a 270° arc. Gold fills to the score. */
export function KaratMeter({ value, size = 168, pending = false }: { value?: number; size?: number; pending?: boolean }) {
  const ticks = Array.from({ length: 24 }, (_, i) => i);
  const k = value ?? 0;
  const R = 70;
  const start = 135;
  return (
    <figure className="relative inline-grid place-items-center" style={{ width: size, height: size }} aria-label={value === undefined ? "Karat pending" : `Karat ${value} of 24`}>
      <svg viewBox="0 0 180 180" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <radialGradient id="kg" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="var(--gold-soft)" />
            <stop offset="60%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--gold-deep)" />
          </radialGradient>
        </defs>
        {ticks.map((i) => {
          const a = ((start + (i / 23) * 270) * Math.PI) / 180;
          const on = value !== undefined && i < k;
          const x1 = 90 + Math.cos(a) * (R - 9);
          const y1 = 90 + Math.sin(a) * (R - 9);
          const x2 = 90 + Math.cos(a) * (R + (i % 6 === 5 ? 6 : 2));
          const y2 = 90 + Math.sin(a) * (R + (i % 6 === 5 ? 6 : 2));
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={on ? "url(#kg)" : "var(--ink-4)"}
              strokeWidth={on ? 4 : 3}
              strokeLinecap="round"
              style={{ transition: `stroke 0.4s ${i * 0.035}s, stroke-width 0.4s ${i * 0.035}s` }}
            />
          );
        })}
      </svg>
      <div className="relative text-center">
        <div className={`display text-[3.2rem] leading-none ${pending ? "animate-pulse text-mute" : "text-molten"}`}>
          {value === undefined ? "··" : <RollingNumber value={value} />}
        </div>
        <div className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.2em] text-paper-dim">Karat / 24</div>
      </div>
    </figure>
  );
}
