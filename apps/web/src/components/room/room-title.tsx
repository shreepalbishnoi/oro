import type { ReactNode } from "react";
import type { Layers } from "lucide-react";

/** Page heading inside Room. `eyebrow` and `icon` are accepted for callers but not drawn: the heading carries the page. */
export function RoomTitle({ title, lede }: { eyebrow?: string; title: ReactNode; lede?: ReactNode; icon?: typeof Layers }) {
  return (
    <header className="mb-8">
      <h1 className="display text-[clamp(1.9rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-balance">{title}</h1>
      {lede && <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-paper-dim">{lede}</p>}
    </header>
  );
}
