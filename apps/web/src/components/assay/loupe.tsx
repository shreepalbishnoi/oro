"use client";

import { useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * The Loupe: a lens that follows the pointer and shows the truth layer under
 * the surface layer. Touch and keyboard users get a "Reveal everything" toggle.
 */
export function Loupe({ surface, truth, label, radius = 120 }: { surface: ReactNode; truth: ReactNode; label: string; radius?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState(false);

  const move = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const r = box.current!.getBoundingClientRect();
    box.current!.style.setProperty("--lx", `${e.clientX - r.left}px`);
    box.current!.style.setProperty("--ly", `${e.clientY - r.top}px`);
    box.current!.style.setProperty("--lr", `${radius}px`);
    box.current!.style.setProperty("--lo", "1");
  };

  return (
    <div className="relative">
      <div
        ref={box}
        onPointerMove={move}
        onPointerLeave={() => {
          box.current?.style.setProperty("--lr", "0px");
          box.current?.style.setProperty("--lo", "0");
        }}
        role="group"
        className="group relative cursor-none select-none"
        style={{ ["--lr" as string]: "0px", ["--lo" as string]: "0", ["--lx" as string]: "50%", ["--ly" as string]: "50%" }}
        aria-label={label}
      >
        <div aria-hidden={all}>{surface}</div>
        <div
          className="absolute inset-0 transition-[clip-path] duration-150"
          style={{ clipPath: all ? "circle(150% at 50% 50%)" : "circle(var(--lr) at var(--lx) var(--ly))" }}
          aria-hidden={!all}
        >
          {truth}
        </div>
        {!all && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full border-2 border-gold/80 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_0_40px_-6px_var(--gold),inset_0_0_30px_rgba(254,211,45,0.12)] transition-[width,height] duration-200"
            style={{ left: "var(--lx)", top: "var(--ly)", width: "calc(var(--lr) * 2)", height: "calc(var(--lr) * 2)", opacity: "var(--lo)", transform: "translate(-50%, -50%)" }}
          />
        )}
      </div>
      <button type="button" onClick={() => setAll((a) => !a)} aria-pressed={all} className="mt-3 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[0.8rem] text-paper-dim hover:border-gold/50 hover:text-paper">
        {all ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        {all ? "Hide the truth layer" : "Reveal everything"}
        <span className="hidden text-mute sm:inline">· or move the loupe over the message</span>
      </button>
    </div>
  );
}
