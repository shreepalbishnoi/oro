"use client";

import Link from "next/link";
import { ArrowUpRight, CircleCheck, OctagonAlert, Radio, CalendarDays, FileText } from "lucide-react";
import type { Story } from "@/lib/fixtures/room";
import { entity, exposureOf, inr, rupeeRange } from "@/lib/room/compute";
import { useRoom } from "./room-context";

const KIND = {
  filing: { label: "Filing", Icon: FileText },
  flag: { label: "Red flag", Icon: OctagonAlert },
  rumour: { label: "Rumour update", Icon: Radio },
  results: { label: "Results", Icon: FileText },
  event: { label: "Event", Icon: CalendarDays },
} as const;

/** Impact range as a band from p10 to p90 with the median tick. Historical, never a forecast. */
export function FanChart({ story, compact = false }: { story: Story; compact?: boolean }) {
  const im = story.impact;
  if (!im) return null;
  const r = rupeeRange(story);
  const lo = Math.min(-12, im.p10 - 1);
  const hi = Math.max(8, im.p90 + 1);
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <figure className={compact ? "" : "rounded-2xl border border-line bg-ink-1/70 p-4"}>
      <div className="relative h-9" aria-hidden="true">
        <span className="absolute top-1/2 h-px w-full bg-line-strong" />
        <span className="absolute top-0 h-full w-px bg-paper/30" style={{ left: `${x(0)}%` }} />
        <span
          className="fan-band absolute top-1/2 h-4 -translate-y-1/2 rounded-full"
          style={{
            left: `${x(im.p10)}%`,
            width: `${x(im.p90) - x(im.p10)}%`,
            background: `linear-gradient(90deg, color-mix(in oklab, var(--red) 70%, transparent), color-mix(in oklab, var(--gold) 50%, transparent) ${((0 - im.p10) / (im.p90 - im.p10)) * 100}%, color-mix(in oklab, var(--green) 70%, transparent))`,
          }}
        />
        <span className="absolute top-1/2 h-6 w-0.5 -translate-y-1/2 rounded bg-paper" style={{ left: `${x(im.p50)}%` }} />
      </div>
      <figcaption className="mt-2 text-[0.8rem] leading-relaxed text-paper-dim">
        In {im.n} similar past events ({im.category.toLowerCase()}), the stock moved between <span className="text-paper">{im.p10 > 0 ? "+" : ""}{im.p10}%</span> and <span className="text-paper">{im.p90 > 0 ? "+" : ""}{im.p90}%</span> over {im.days} days.
        {r && (
          <>
            {" "}
            On your {inr(r.exposure, { compact: true })}, that&rsquo;s <span className="text-paper">{inr(r.lo, { sign: true })}</span> to <span className="text-paper">{inr(r.hi, { sign: true })}</span>.
          </>
        )}
      </figcaption>
    </figure>
  );
}

export function StoryCard({ story, featured = false }: { story: Story; featured?: boolean }) {
  const { setFocus } = useRoom();
  const e = entity(story.symbol);
  const x = exposureOf(story.symbol);
  const k = KIND[story.kind];
  const sevColor = story.severity === "high" ? "var(--red)" : story.severity === "medium" ? "var(--gold)" : "var(--green)";
  const funds = x?.paths.filter((p) => p.via !== "cdsl") ?? [];

  return (
    <article
      onMouseEnter={() => setFocus(story.id)}
      onFocus={() => setFocus(story.id)}
      className={`group relative rounded-[1.5rem] border border-line bg-ink-1/80 p-5 backdrop-blur-md transition-colors hover:border-gold/40 focus-within:border-gold/40 ${featured ? "sm:p-6" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[0.8rem] font-medium" style={{ color: sevColor }}>
          <k.Icon className="size-3.5" aria-hidden="true" />
          {k.label} · {e.name}
        </p>
        <p className="flex items-center gap-1.5 text-[0.8rem] font-medium text-gold">
          <CircleCheck className="size-3.5" aria-hidden="true" />
          {story.karat}K
        </p>
      </div>
      <h2 className={`mt-3 font-display leading-snug text-paper ${featured ? "text-[1.6rem]" : "text-[1.3rem]"}`}>
        <Link href={`/room/story/${story.id}`} className="outline-none after:absolute after:inset-0 after:rounded-[1.5rem] focus-visible:underline">
          {story.headline}
        </Link>
      </h2>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-paper-dim">{story.plain}</p>

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[0.8rem]">
        <div className="flex gap-1.5">
          <dt className="text-mute">Source</dt>
          <dd className="text-paper">
            {story.source} · {story.ago}
          </dd>
        </div>
        {x && (
          <div className="flex gap-1.5">
            <dt className="text-mute">Your money in it</dt>
            <dd className="text-paper">
              {inr(x.total)}
              {funds.length > 0 && <span className="text-paper-dim"> · via {x.direct > 0 ? `demat + ${funds.length} fund${funds.length > 1 ? "s" : ""}` : `${funds.length} fund${funds.length > 1 ? "s" : ""}`}</span>}
            </dd>
          </div>
        )}
      </dl>

      {story.impact && (
        <div className="mt-4">
          <FanChart story={story} compact />
        </div>
      )}

      {x && (
        <div className="relative z-10 mt-4 hidden flex-wrap items-center gap-1.5 text-[0.75rem] text-paper-dim group-hover:flex group-focus-within:flex">
          <span className="text-mute">How this reaches you:</span>
          {x.paths.map((p) => (
            <span key={p.via} className="rounded-full border border-line bg-ink-2 px-2 py-0.5">
              {p.viaName} {inr(p.inr, { compact: true })}
            </span>
          ))}
          <Link href={`/room/xray?focus=${story.symbol}`} className="inline-flex items-center gap-0.5 text-gold">
            X-ray <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
      )}
    </article>
  );
}
