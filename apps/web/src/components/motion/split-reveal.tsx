"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap, reduced, SplitText, useGSAP } from "@/lib/gsap";

/**
 * Lines rise out of a mask as they enter the viewport (or immediately with `immediate`).
 * Text stays fully readable without JS and under reduced motion.
 */
export function SplitReveal({
  as: Tag = "div",
  children,
  className,
  immediate = false,
  delay = 0,
  stagger = 0.09,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  immediate?: boolean;
  delay?: number;
  stagger?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (!ref.current || reduced()) return;
      const split = SplitText.create(ref.current, { type: "lines", mask: "lines", linesClass: "split-line", autoSplit: true,
        onSplit(self) {
          return gsap.from(self.lines, {
            yPercent: 110,
            rotate: 2.5,
            duration: 1.25,
            ease: "molten",
            stagger,
            delay,
            scrollTrigger: immediate ? undefined : { trigger: ref.current, start: "top 85%", once: true },
          });
        },
      });
      return () => split.revert();
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
