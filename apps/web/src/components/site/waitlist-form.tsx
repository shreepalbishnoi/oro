"use client";

import { useState } from "react";
import { writeLocal } from "@/lib/local";

/** Waitlist sign-up. Preview: remembered in this browser only; no email is sent anywhere yet. */
export function WaitlistForm() {
  const [done, setDone] = useState(false);
  if (done)
    return (
      <p role="status" className="text-[0.92rem] text-green">
        You&rsquo;re on the list. We&rsquo;ll write once, at launch.
      </p>
    );
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const email = new FormData(e.currentTarget).get("email");
        writeLocal("oro.waitlist", { email, at: Date.now() });
        setDone(true);
      }}
    >
      <label htmlFor="wl" className="sr-only">
        Email
      </label>
      <input id="wl" name="email" type="email" required placeholder="you@example.com" className="min-w-0 flex-1 rounded-full border border-line bg-ink-2 px-4 py-2.5 text-paper focus:border-gold focus:outline-none" />
      <button className="btn btn-gold h-11 px-4 text-sm">Join waitlist</button>
    </form>
  );
}
