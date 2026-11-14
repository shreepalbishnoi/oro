import type { ReactNode } from "react";
import { SplitReveal } from "@/components/motion/split-reveal";

/** Section heading for the landing chapters: the heading carries the section, no kicker above it. */
export function ChapterHead({ title, lede, align = "left", className }: { title: ReactNode; lede?: ReactNode; align?: "left" | "center"; className?: string }) {
  return (
    <header className={`${align === "center" ? "mx-auto text-center" : ""} max-w-3xl ${className ?? ""}`}>
      <SplitReveal as="h2" className="display text-[clamp(2.4rem,5.6vw,4.6rem)] leading-[0.98] tracking-[-0.024em]">
        {title}
      </SplitReveal>
      {lede && <p className={`mt-6 max-w-2xl text-[1.1rem] leading-relaxed text-paper-dim ${align === "center" ? "mx-auto" : ""}`}>{lede}</p>}
    </header>
  );
}
