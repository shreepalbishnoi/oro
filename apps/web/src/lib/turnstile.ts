"use client";

import { optionalEnv } from "@/lib/env";
/**
 * Cloudflare Turnstile, invisible unless Cloudflare suspects a bot. Protects the free Groq quota
 * from scripted checks. Off when NEXT_PUBLIC_TURNSTILE_SITE_KEY is empty (local dev): the API then
 * skips verification too, as long as TURNSTILE_SECRET is also empty.
 */
type TS = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TS;
  }
}

const SITE_KEY = optionalEnv(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) ?? "";
let scriptP: Promise<TS> | null = null;
let widget: string | null = null;
let pending: ((t: string | undefined) => void) | null = null;

function loadScript(): Promise<TS> {
  scriptP ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(s);
  });
  return scriptP;
}

/** A fresh single-use token, or undefined when Turnstile is off or can't load (the API decides). */
export async function getTurnstileToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  try {
    const ts = await loadScript();
    if (!widget) {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;bottom:16px;left:16px;z-index:200";
      document.body.appendChild(el);
      widget = ts.render(el, {
        sitekey: SITE_KEY,
        execution: "execute",
        appearance: "interaction-only",
        callback: (t: string) => pending?.(t),
        "error-callback": () => pending?.(undefined),
        "expired-callback": () => widget && ts.reset(widget),
      });
    } else {
      ts.reset(widget);
    }
    return await new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(undefined), 15_000);
      pending = (t) => {
        window.clearTimeout(timer);
        pending = null;
        resolve(t);
      };
      ts.execute(widget!);
    });
  } catch {
    return undefined;
  }
}
