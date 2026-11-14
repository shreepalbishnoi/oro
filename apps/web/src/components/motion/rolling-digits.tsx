"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, reduced } from "@/lib/gsap";

/** A number that rolls to its new value. Announces only the final value to screen readers. */
export function RollingNumber({
  value,
  format = (n) => Math.round(n).toLocaleString("en-IN"),
  duration = 1.1,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const obj = useRef({ v: value });
  useEffect(() => {
    const t = gsap.to(obj.current, { v: value, duration: reduced() ? 0 : duration, ease: "power3.out", onUpdate: () => setShown(obj.current.v) });
    return () => {
      t.kill();
    };
  }, [value, duration]);
  return (
    <span className={`tabular ${className ?? ""}`}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
