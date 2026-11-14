"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

/** Email + password (works with no outside service) and Google when it's configured. */
export function AuthForm({ google }: { google: boolean }) {
  const id = useId();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("next") ?? "/room";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/room";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const name = String(f.get("name") ?? "").trim();
    setBusy(true);
    setErr(null);
    const res = mode === "in" ? await signIn.email({ email, password }) : await signUp.email({ email, password, name: name || email.split("@")[0] });
    setBusy(false);
    if (res.error) {
      const m = res.error.message ?? "";
      setErr(
        res.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : mode === "in"
            ? "That email and password don't match."
            : /exist/i.test(m)
              ? "An account with this email already exists. Sign in instead."
              : m || "Couldn't create the account.",
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  const field = "mt-1 block w-full rounded-xl border border-line bg-ink-2 px-3 py-2.5 text-paper focus:border-gold focus:outline-none";
  return (
    <div className="text-left">
      <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-full border border-line p-1">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setErr(null);
            }}
            className={`rounded-full py-2 text-sm transition-colors ${mode === m ? "bg-gold text-ink" : "text-paper-dim hover:text-paper"}`}
          >
            {m === "in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {google && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void signIn.social({ provider: "google", callbackURL: next })}
            className="btn btn-ghost mt-5 h-11 w-full"
          >
            Continue with Google
          </button>
          <div className="my-5 flex items-center gap-3 text-[0.75rem] text-mute">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} className={google ? "space-y-3" : "mt-5 space-y-3"}>
        {mode === "up" && (
          <label className="block text-[0.85rem] text-paper-dim" htmlFor={`${id}-n`}>
            Name <span className="text-mute">(optional)</span>
            <input id={`${id}-n`} name="name" autoComplete="name" maxLength={80} className={field} />
          </label>
        )}
        <label className="block text-[0.85rem] text-paper-dim" htmlFor={`${id}-e`}>
          Email
          <input id={`${id}-e`} name="email" type="email" required autoComplete="email" className={field} />
        </label>
        <label className="block text-[0.85rem] text-paper-dim" htmlFor={`${id}-p`}>
          Password {mode === "up" && <span className="text-mute">(10+ characters)</span>}
          <input id={`${id}-p`} name="password" type="password" required minLength={10} maxLength={128} autoComplete={mode === "in" ? "current-password" : "new-password"} className={field} />
        </label>
        {err && (
          <p role="alert" className="text-[0.85rem] text-red">
            {err}
          </p>
        )}
        <button disabled={busy} className="btn btn-gold h-11 w-full">
          {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-[0.75rem] leading-relaxed text-mute">
        Your Room is private to you. ORO never sells data and never tells you to buy, sell or hold anything.
      </p>
    </div>
  );
}
