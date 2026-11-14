"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, UserRound } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { invalidateRoom } from "@/lib/room/live";

/** Sign-in link for visitors; account menu (settings, sign out) for members. */
export function AccountMenu() {
  const { data, isPending } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (isPending) return <span className="size-10" aria-hidden="true" />;
  if (!data?.user) {
    return (
      <Link href="/login?next=/room" className="btn btn-ghost h-10 px-4 text-sm">
        Sign in
      </Link>
    );
  }
  const u = data.user;
  const initial = (u.name || u.email || "?").trim()[0]?.toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Your account"
        className="grid size-10 place-items-center rounded-full border border-gold/40 bg-gold/10 font-mono text-sm text-gold hover:bg-gold/20"
      >
        {initial ?? <UserRound className="size-4" aria-hidden="true" />}
      </button>
      {open && (
        <div role="menu" className="absolute top-12 right-0 z-50 w-64 rounded-2xl border border-line bg-ink-2 p-2 shadow-2xl">
          <p className="truncate px-3 pt-2 pb-3 text-[0.8rem] text-paper-dim">{u.email}</p>
          <Link role="menuitem" href="/settings/data" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-[0.9rem] text-paper hover:bg-paper/5">
            <Settings className="size-4" aria-hidden="true" /> Settings and privacy
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await signOut();
              invalidateRoom();
              setOpen(false);
              router.push("/");
              router.refresh();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[0.9rem] text-paper hover:bg-paper/5"
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
