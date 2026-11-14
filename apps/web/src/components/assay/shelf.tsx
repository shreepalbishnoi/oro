"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { readLocal, SHELF_KEY, writeLocal, type ShelfItem } from "@/lib/local";
import { Hallmark } from "./hallmark";
import { Chip, RISK } from "./meta";

/** Your shelf of hallmarks, kept in this browser only until accounts open. */
export function Shelf() {
  const [items, setItems] = useState<ShelfItem[] | null>(null);
  useEffect(() => {
    const load = () => setItems(readLocal<ShelfItem[]>(SHELF_KEY, []));
    const id = requestAnimationFrame(load);
    window.addEventListener("oro:local", load);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("oro:local", load);
    };
  }, []);

  if (items === null) return <div className="h-40 animate-pulse rounded-[1.5rem] bg-ink-2/60" aria-hidden="true" />;
  if (items.length === 0)
    return (
      <div className="glass max-w-xl rounded-[1.5rem] p-8">
        <p className="display text-3xl">No saved checks yet.</p>
        <p className="mt-3 text-paper-dim">After a check, press Save result to keep it here, or share the result card with the group that sent you the tip.</p>
        <Link href="/parakh" className="btn btn-gold mt-6">
          Check your first tip
        </Link>
      </div>
    );

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => {
        const r = RISK[it.risk];
        return (
          <li key={it.slug} className="glass group relative flex flex-col gap-4 rounded-[1.5rem] p-5 transition hover:border-gold/40">
            <div className="flex items-start justify-between gap-3">
              <Hallmark karat={it.karat} risk={it.risk} size={88} animate={false} date={new Date(it.at)} />
              <button
                type="button"
                aria-label="Remove from shelf"
                className="rounded-full p-2 text-mute opacity-0 transition group-hover:opacity-100 hover:bg-paper/5 hover:text-red focus-visible:opacity-100"
                onClick={() => writeLocal(SHELF_KEY, items.filter((x) => x.slug !== it.slug))}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
            <Chip color={r.color} Icon={r.Icon} className="self-start">
              {r.label}
            </Chip>
            <p className="line-clamp-3 text-[0.95rem] leading-snug text-paper">{it.summary}</p>
            <p className="line-clamp-2 font-mono text-[0.72rem] text-mute">“{it.snippet}”</p>
            <Link href={`/v/${it.slug}`} className="mt-auto text-[0.88rem] text-gold underline-offset-4 after:absolute after:inset-0 hover:underline">
              Open verdict
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
