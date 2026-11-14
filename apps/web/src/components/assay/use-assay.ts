"use client";

import { useCallback, useReducer, useRef } from "react";
import type { AssayEvent, Claim, Disclosure, Judgment, KaratParts, RiskBand, Signal, Trail, Verdict } from "@/lib/engine/types";
import { pulseField, setFieldKarat } from "@/lib/field-bus";
import { getTurnstileToken } from "@/lib/turnstile";

export type Stage = "idle" | "scrub" | "signals" | "claims" | "evidence" | "karat" | "done" | "error";

export type AssayState = {
  stage: Stage;
  redacted?: string;
  piiRemoved: number;
  signals: Signal[];
  claims: Claim[];
  judgments: Record<string, Judgment>;
  karat?: number;
  parts?: KaratParts;
  risk?: RiskBand;
  trail?: Trail | null;
  otherSide: Disclosure[];
  verdict?: Verdict;
  slug?: string;
  error?: string;
};

const initial: AssayState = { stage: "idle", piiRemoved: 0, signals: [], claims: [], judgments: {}, otherSide: [] };

function reduce(s: AssayState, e: AssayEvent | { type: "reset" } | { type: "start" }): AssayState {
  switch (e.type) {
    case "reset":
      return initial;
    case "start":
      return { ...initial, stage: "scrub" };
    case "stage":
      return { ...s, stage: e.stage };
    case "scrubbed":
      return { ...s, redacted: e.redacted, piiRemoved: e.piiRemoved };
    case "signal":
      return { ...s, signals: [...s.signals, e.signal] };
    case "claims":
      return { ...s, claims: e.claims };
    case "judgment":
      return { ...s, judgments: { ...s.judgments, [e.judgment.claimId]: e.judgment } };
    case "karat":
      return { ...s, karat: e.karat, parts: e.parts, risk: e.risk };
    case "trail":
      return { ...s, trail: e.trail };
    case "otherSide":
      return { ...s, otherSide: e.items };
    case "done":
      return { ...s, stage: "done", verdict: e.verdict, slug: e.slug };
    case "error":
      return { ...s, stage: "error", error: e.message };
  }
}

/** Runs a check against /api/checks and folds the SSE events into state. */
export function useAssay() {
  const [state, dispatch] = useReducer(reduce, initial);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async (text: string, kind: "text" | "link" | "image" = "text") => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    dispatch({ type: "start" });
    setFieldKarat(-1);
    try {
      const turnstileToken = await getTurnstileToken();
      const res = await fetch("/api/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind, turnstileToken }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const p = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
        dispatch({ type: "error", message: p.detail ?? p.title ?? "The check failed. Try again." });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as AssayEvent;
          dispatch(ev);
          if (ev.type === "done" || ev.type === "error") finished = true;
          if (ev.type === "signal" && ev.signal.severity === "severe") pulseField("red", 0.6);
          if (ev.type === "karat") {
            setFieldKarat(ev.karat);
            pulseField(ev.risk === "high" ? "red" : ev.risk === "low" ? "green" : "gold", 1.2);
          }
        }
      }
      // The connection closed without a verdict (server restart, network drop): say so instead of spinning.
      if (!finished) dispatch({ type: "error", message: "The check was interrupted. Try again." });
    } catch (err) {
      if ((err as Error).name !== "AbortError") dispatch({ type: "error", message: "Couldn't reach the checker. Check your connection and try again." });
    }
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    setFieldKarat(-1);
    dispatch({ type: "reset" });
  }, []);

  return { state, run, reset };
}
