"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/auth-client";

export type RoomMode = "pending" | "demo" | "live";

/** Signed in → your Room (live API data). Signed out → the fictional demo Room. */
export function useRoomMode(): RoomMode {
  const { data, isPending } = useSession();
  if (isPending) return "pending";
  return data?.user ? "live" : "demo";
}

/** Renders the server-built demo or the live client view, without reading cookies on the server. */
export function RoomSwitch({ demo, live }: { demo: ReactNode; live: ReactNode }) {
  const mode = useRoomMode();
  if (mode === "pending") return <RoomSkeleton />;
  return <>{mode === "live" ? live : demo}</>;
}

export function RoomSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading your Room" className="animate-pulse space-y-4">
      <div className="h-4 w-48 rounded-full bg-ink-3" />
      <div className="h-10 w-3/4 rounded-2xl bg-ink-3" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-28 rounded-[1.5rem] border border-line bg-ink-1/60" />
      ))}
    </div>
  );
}

export function LiveError({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[1.5rem] border border-red/40 bg-red/5 p-5">
      <p className="text-paper">{title}</p>
      {detail && <p className="mt-1 text-[0.9rem] text-paper-dim">{detail}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-ghost mt-4 h-9 px-4 text-sm">
          Try again
        </button>
      )}
    </div>
  );
}
