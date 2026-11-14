"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { ApiProblem, call } from "@/lib/room/live";

function urlB64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "off-server" | "denied" | "off" | "on";

/** Browser push for material filings on your holdings. Works on Android/desktop; on iPhone after "Add to Home Screen". */
export function LiveAlerts() {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      const { publicKey } = await call<{ publicKey: string | null }>("/push/key").catch(() => ({ publicKey: null }));
      if (!publicKey) return setState("off-server");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })();
  }, []);

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    try {
      const { publicKey } = await call<{ publicKey: string | null }>("/push/key");
      if (!publicKey) return setState("off-server");
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) }));
      await call("/push/subscribe", { method: "POST", json: sub.toJSON() });
      await call("/push/test", { method: "POST" }).catch(() => undefined);
      setState("on");
      setMsg("Done. A test notification is on its way.");
    } catch (e) {
      setMsg(e instanceof ApiProblem ? (e.detail ?? e.title) : "Couldn't turn on alerts in this browser.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await call("/push/unsubscribe", { method: "POST", json: { endpoint: sub.endpoint } }).catch(() => undefined);
      await sub.unsubscribe();
    }
    setState("off");
    setBusy(false);
  }

  const copy: Record<State, string> = {
    loading: "Checking this browser…",
    unsupported: "This browser can't receive notifications. On iPhone, tap Share → Add to Home Screen, then open ORO from there.",
    "off-server": "Alerts aren't switched on for ORO yet.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
    off: "Get a notification only when a material, verified filing touches your money: pledges, resignations, auditor changes, defaults, regulator actions and rumour denials. At most 4 a day, never between 10 pm and 7 am.",
    on: "On for this browser. ORO alerts only on material, verified filings about what you hold; everything else waits quietly in your feed.",
  };

  return (
    <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
      {state === "on" ? <BellRing className="size-5 text-green" aria-hidden="true" /> : <BellOff className="size-5 text-gold" aria-hidden="true" />}
      <h2 className="mt-3 text-paper">Notifications on this device</h2>
      <p className="mt-1 max-w-2xl text-[0.9rem] text-paper-dim">{copy[state]}</p>
      {state === "off" && (
        <button type="button" disabled={busy} onClick={turnOn} className="btn btn-gold mt-4 h-10 px-4 text-sm">
          Turn on alerts
        </button>
      )}
      {state === "on" && (
        <button type="button" disabled={busy} onClick={turnOff} className="btn btn-ghost mt-4 h-10 px-4 text-sm">
          Turn off on this device
        </button>
      )}
      {msg && (
        <p role="status" className="mt-3 text-[0.85rem] text-paper-dim">
          {msg}
        </p>
      )}
    </section>
  );
}
