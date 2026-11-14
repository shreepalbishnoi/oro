"use client";

import { Compass, Landmark, Layers, Network, ScrollText } from "lucide-react";
import { useRoom } from "@/components/room/room-context";
import { inr, pct } from "@/lib/room/compute";
import { useApi, type DiscoverCard, type DiscoverOut, type FeedOut } from "@/lib/room/live";

const ICON = { connected: Network, funds: Layers, filings: ScrollText, concentration: Landmark } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function CardBody({ c }: { c: DiscoverCard }) {
  const it = c.items as Record<string, string & number>[];
  switch (c.kind) {
    case "connected":
      return (
        <ul className="space-y-2">
          {it.map((x) => (
            <li key={x.id}>
              <span className="text-paper">{x.name}</span>
              <p className="text-[0.75rem] text-mute">
                {x.why}
                {x.symbol ? ` · ${x.symbol}` : ""}
              </p>
            </li>
          ))}
        </ul>
      );
    case "funds":
      return (
        <ul className="space-y-1.5">
          {it.map((x) => (
            <li key={x.id} className="flex justify-between gap-2">
              <span className="text-paper">{x.name}</span>
              <span className="font-mono text-paper-dim">{pct(x.weight)}</span>
            </li>
          ))}
          {it[0]?.asOf && <li className="text-[0.72rem] text-mute">Weights as disclosed {day(it[0].asOf)}.</li>}
        </ul>
      );
    case "filings":
      return (
        <ul className="space-y-2">
          {it.map((x) => (
            <li key={x.id}>
              <a href={x.url} target="_blank" rel="noreferrer" className="text-paper hover:text-gold">
                {x.title}
              </a>
              <p className="text-[0.72rem] text-mute">{day(x.publishedAt)}</p>
            </li>
          ))}
        </ul>
      );
    case "concentration":
      return (
        <p className="text-paper-dim">
          <span className="text-paper">{pct(it[0].share)}</span> of your money is in the {String(it[0].label).toLowerCase()} ({inr(it[0].inr, { compact: true })}).
        </p>
      );
  }
}

/** Discover for live stories: rules only, same cards for everyone, fixed order (PLAN §9.5). */
export function LiveDiscoverBody() {
  const { focus } = useRoom();
  const feed = useApi<FeedOut>("/room/feed?limit=30");
  const focused = focus?.startsWith("live:") ? Number(focus.slice(5)) : null;
  const storyId = focused ?? feed.data?.items[0]?.id ?? null;
  const story = feed.data?.items.find((i) => i.id === storyId);
  const d = useApi<DiscoverOut>(storyId ? `/discover?story_id=${storyId}` : null);

  return (
    <div className="space-y-3">
      <div>
        <p className="eyebrow flex items-center gap-2">
          <Compass className="size-3.5 text-gold" aria-hidden="true" /> Discover
        </p>
        <p className="mt-2 text-[0.95rem] leading-snug text-paper">{story ? <>Around <span className="text-gold">{story.symbols[0] ?? story.title.slice(0, 40)}</span></> : "Hover a story to explore around it."}</p>
      </div>
      {d.loading && <div className="h-40 animate-pulse rounded-2xl border border-line bg-ink-1/60" />}
      {d.data?.cards.map((c) => {
        const Icon = ICON[c.kind] ?? Compass;
        return (
          <section key={c.kind} className="rounded-2xl border border-line bg-ink-1/70 p-4">
            <h3 className="flex items-center gap-2 text-[0.8rem] font-medium text-paper-dim">
              <Icon className="size-3.5 text-gold" aria-hidden="true" />
              {c.title}
            </h3>
            <div className="mt-3 text-[0.88rem]">
              <CardBody c={c} />
            </div>
          </section>
        );
      })}
      {d.data && d.data.cards.length === 0 && <p className="text-[0.85rem] text-mute">No linked companies or funds for this story in ORO&rsquo;s records yet.</p>}
      <p className="px-1 text-[0.72rem] leading-relaxed text-mute">For information, not a recommendation. Every reader sees the same items for the same story, in a fixed public order.</p>
    </div>
  );
}
