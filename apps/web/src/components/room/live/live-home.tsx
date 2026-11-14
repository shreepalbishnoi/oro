"use client";

import Link from "next/link";
import { ArrowUpRight, CircleCheck, FileText, OctagonX, Sparkles, Upload } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";
import { useRoom } from "@/components/room/room-context";
import { inr, pct } from "@/lib/room/compute";
import { call, useApi, type FeedItem, type FeedOut, type MeOut, type SummaryOut } from "@/lib/room/live";
import { LiveError, RoomSkeleton } from "./mode";

const TIER = ["", "Exchange filing", "Regulator", "Company", "News report", "Other"];

export function ago(iso: string) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function LiveStoryCard({ item, featured = false }: { item: FeedItem; featured?: boolean }) {
  const { setFocus } = useRoom();
  const denies = item.deniesRumour;
  return (
    <article
      onMouseEnter={() => setFocus(`live:${item.id}`)}
      onFocus={() => setFocus(`live:${item.id}`)}
      className={`group relative rounded-[1.5rem] border bg-ink-1/80 p-5 backdrop-blur-md transition-colors hover:border-gold/40 focus-within:border-gold/40 ${item.read ? "border-line/60" : "border-line"} ${featured ? "sm:p-6" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`flex items-center gap-2 text-[0.8rem] font-medium ${denies ? "text-red" : "text-paper-dim"}`}>
          {denies ? <OctagonX className="size-3.5" aria-hidden="true" /> : <FileText className="size-3.5" aria-hidden="true" />}
          {denies ? "Rumour denied" : (TIER[item.tier] ?? "Source")} · {item.symbols.slice(0, 3).join(", ") || "Market"}
        </p>
        {item.tier <= 2 && (
          <p className="flex items-center gap-1.5 text-[0.8rem] font-medium text-gold">
            <CircleCheck className="size-3.5" aria-hidden="true" /> Primary source
          </p>
        )}
      </div>
      <h2 className={`mt-3 font-display leading-snug text-paper ${featured ? "text-[1.5rem]" : "text-[1.2rem]"}`}>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => void call(`/stories/${item.id}/read`, { method: "POST" }).catch(() => undefined)}
          className="outline-none after:absolute after:inset-0 after:rounded-[1.5rem] focus-visible:underline"
        >
          {item.title}
        </a>
      </h2>
      {item.summary && <p className="mt-2 line-clamp-3 text-[0.92rem] leading-relaxed text-paper-dim">{item.summary}</p>}
      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[0.8rem]">
        <div className="flex gap-1.5">
          <dt className="text-mute">From</dt>
          <dd className="inline-flex items-center gap-1 text-paper">
            {item.source} · {ago(item.publishedAt)} <ArrowUpRight className="size-3 text-gold" aria-hidden="true" />
          </dd>
        </div>
        {item.yourExposureInr != null && (
          <div className="flex gap-1.5">
            <dt className="text-mute">Your money in it</dt>
            <dd className="text-paper">
              {inr(item.yourExposureInr)}
              {item.viaFunds > 0 && <span className="text-paper-dim"> · through {item.viaFunds} fund{item.viaFunds > 1 ? "s" : ""}</span>}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

export function LiveHome() {
  const me = useApi<MeOut>("/me");
  const ready = Boolean(me.data?.consents.portfolio_analysis);
  const summary = useApi<SummaryOut>(ready ? "/room/summary" : null);
  const feed = useApi<FeedOut>(ready ? "/room/feed?limit=30" : null);

  if (me.error) return <LiveError title={me.error.title} detail={me.error.detail} onRetry={me.reload} />;
  if (!me.data) return <RoomSkeleton />;
  if (!ready || (summary.data && summary.data.netWorthInr === 0 && !summary.data.topExposures.length)) {
    return (
      <>
        <RoomTitle icon={Sparkles} eyebrow="Your Room" title={<>Add your holdings to start.</>} lede="Import a CAS statement or a broker CSV. Room then keeps only the verified news that reaches your money, directly or through your funds." />
        <Link href="/room/holdings" className="btn btn-gold h-11 px-5">
          <Upload className="size-4" aria-hidden="true" /> Import holdings
        </Link>
      </>
    );
  }
  if (summary.error) return <LiveError title={summary.error.title} detail={summary.error.detail} onRetry={summary.reload} />;
  if (!summary.data) return <RoomSkeleton />;

  const s = summary.data;
  const since = s.sinceYouLastCame ?? [];
  const exposed = since.reduce((a, x) => a + (x.yourExposureInr ?? 0), 0);
  const denied = since.filter((x) => x.deniesRumour).length;
  const items = feed.data?.items ?? [];

  return (
    <>
      <RoomTitle
        icon={Sparkles}
        eyebrow={s.lastSeenAt ? `Since you last came · ${new Date(s.lastSeenAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Your Room"}
        title={
          since.length ? (
            <>
              {since.length} verified update{since.length > 1 ? "s" : ""} reach {inr(exposed, { compact: true })} of your money.{" "}
              {denied > 0 && <span className="display-italic text-gold">{denied} denied a rumour.</span>}
            </>
          ) : (
            <>
              {inr(s.netWorthInr, { compact: true })} in your Room. <span className="display-italic text-gold">Nothing new touches it.</span>
            </>
          )
        }
      />

      <section aria-label="Summary" className="glass mb-10 grid gap-5 rounded-[1.75rem] p-5 sm:grid-cols-[1fr_auto] sm:p-6">
        <div>
          <p className="eyebrow">Where most of your money sits</p>
          <ul className="mt-4 space-y-2.5">
            {s.topExposures.map((e) => (
              <li key={e.name} className="flex items-baseline justify-between gap-4 text-[0.95rem]">
                <span className="text-paper">{e.name}</span>
                <span className="font-mono text-paper-dim">
                  {pct(e.share)} · {inr(e.totalInr, { compact: true })}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-line sm:border-l sm:pl-6">
          <p className="eyebrow">Net worth</p>
          <p className="display mt-1 text-3xl tabular">{inr(s.netWorthInr, { compact: true })}</p>
          <p className="mt-1 text-[0.75rem] text-mute">{s.asOf ? `As of ${new Date(s.asOf).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} close` : "Last close"}</p>
          {s.topGroup && !["Independent", "No group"].includes(s.topGroup.name) && (
            <p className="mt-3 max-w-[16rem] text-[0.8rem] text-paper-dim">
              {pct(s.topGroup.share)} is in the {s.topGroup.name} group.
            </p>
          )}
        </div>
      </section>

      <h2 className="eyebrow mb-4">Most important first</h2>
      {feed.error && <LiveError title={feed.error.title} detail={feed.error.detail} onRetry={feed.reload} />}
      {!feed.data && !feed.error && <RoomSkeleton rows={2} />}
      <div className="space-y-4">
        {items.map((it, i) => (
          <LiveStoryCard key={it.id} item={it} featured={i === 0} />
        ))}
      </div>
      {feed.data && (
        <p className="mt-8 text-center text-[0.8rem] text-mute">
          {items.length ? "That's everything about your holdings. " : "Nothing has been filed about your holdings yet. "}
          Past-event ranges are history, not a forecast.
        </p>
      )}
    </>
  );
}
