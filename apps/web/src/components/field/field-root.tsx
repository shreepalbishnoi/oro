"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

const OverlapField = dynamic(() => import("./overlap-field"), { ssr: false });

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * The global background. A CSS poster paints immediately (no LCP cost); the
 * WebGL field loads when the browser is idle, then the poster fades out.
 * Reduced motion and no-WebGL keep the poster.
 */
export function FieldRoot() {
  const [mount, setMount] = useState(false);
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches || !webglOk()) return;
    // Mount after the hero intro has started so shader compilation never blocks first paint.
    const start = () => window.setTimeout(() => setMount(true), 700);
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = ric ? ric(start, { timeout: 1200 }) : window.setTimeout(start, 400);
    const onChange = () => mq.matches && setMount(false);
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      if (!ric) window.clearTimeout(handle);
    };
  }, []);

  return (
    <>
      <div className="field-poster" style={{ opacity: ready ? 0 : 1 }} aria-hidden="true" />
      {mount && <OverlapField onReady={markReady} />}
    </>
  );
}
