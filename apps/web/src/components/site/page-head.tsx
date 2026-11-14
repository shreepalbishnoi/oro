import type { ReactNode } from "react";
import { SplitReveal } from "@/components/motion/split-reveal";

/** Opening block for inner pages. `eyebrow` is kept for callers but not drawn: the heading carries the page. */
export function PageHead({ title, lede, children, className }: { eyebrow?: string; title: ReactNode; lede?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={`frame pt-36 pb-12 sm:pt-44 ${className ?? ""}`}>
      <SplitReveal as="h1" immediate className="display max-w-4xl text-[clamp(2.6rem,7vw,5.6rem)] leading-[0.95] tracking-[-0.028em]">
        {title}
      </SplitReveal>
      {lede && <p className="mt-6 max-w-2xl text-[1.08rem] leading-relaxed text-paper-dim">{lede}</p>}
      {children}
    </header>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose-oro max-w-3xl space-y-5 text-[1.02rem] leading-relaxed text-paper-dim">{children}</div>;
}
