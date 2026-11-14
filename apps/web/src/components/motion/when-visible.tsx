"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Mounts children only when the placeholder nears the viewport, so their code loads late. Height is reserved to avoid layout shift. */
export function WhenVisible({ children, minHeight, margin = "700px" }: { children: ReactNode; minHeight: string; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return (
    <div ref={ref} style={{ minHeight }}>
      {on ? children : null}
    </div>
  );
}
