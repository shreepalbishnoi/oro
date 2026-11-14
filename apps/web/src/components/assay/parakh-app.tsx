"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { LiveAssay } from "./live-assay";
import { TipInput } from "./tip-input";
import { useAssay } from "./use-assay";
import { scrollToTarget } from "@/components/motion/smooth-scroll";

/**
 * The full check surface. Reads ?text= / ?url= / ?title= so the Android share
 * sheet (PWA share_target, GET) lands straight in a running check.
 */
export function ParakhApp() {
  const params = useSearchParams();
  const shared = [params.get("title"), params.get("text"), params.get("url")].filter(Boolean).join("\n").trim();
  const { state, run, reset } = useAssay();
  const out = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (shared.length >= 8 && !started.current) {
      started.current = true;
      run(shared.slice(0, 4000), /^\s*https?:\/\/\S+\s*$/.test(shared) ? "link" : "text");
    }
  }, [shared, run]);

  const busy = state.stage !== "idle" && state.stage !== "done" && state.stage !== "error";

  return (
    <div className="space-y-8">
      <TipInput
        key={shared}
        initial={shared}
        busy={busy}
        autoFocus={!shared}
        onSubmit={(t, k) => {
          run(t, k);
          requestAnimationFrame(() => out.current && scrollToTarget(out.current));
        }}
      />
      <div ref={out} className="scroll-mt-24">
        {state.stage !== "idle" && (
          <div className="glass rounded-[2rem] p-5 sm:p-8">
            <LiveAssay state={state} onReset={reset} />
          </div>
        )}
      </div>
    </div>
  );
}
