"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CalendarDays, Compass, Landmark, Layers, Network, X } from "lucide-react";
import { discover } from "@/lib/room/discover";
import { inr, pct } from "@/lib/room/compute";
import { useRoom } from "./room-context";
import { LiveDiscoverBody } from "./live/live-discover";
import { useRoomMode } from "./live/mode";

function Card({ icon: Icon, title, children }: { icon: typeof Compass; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-ink-1/70 p-4">
      <h3 className="flex items-center gap-2 text-[0.8rem] font-medium text-paper-dim">
        <Icon className="size-3.5 text-gold" aria-hidden="true" />
        {title}
      </h3>
      <div className="mt-3 text-[0.88rem]">{children}</div>
    </section>
  );
}

function Body() {
  const mode = useRoomMode();
  if (mode === "live") return <LiveDiscoverBody />;
  if (mode === "pending") return null;
  return <DemoBody />;
}

function DemoBody() {
  const { focus } = useRoom();
  const pathname = usePathname();
  const fromPath = pathname.startsWith("/room/story/") ? pathname.split("/").pop()! : null;
  const d = discover(focus ?? fromPath);
  return (
    <div className="space-y-3">
      <div>
        <p className="eyebrow flex items-center gap-2">
          <Compass className="size-3.5 text-gold" aria-hidden="true" /> Discover
        </p>
        <p className="mt-2 text-[0.95rem] leading-snug text-paper">
          Around <span className="text-gold">{d.entity.name}</span>
        </p>
      </div>

      <Card icon={Network} title="Connected companies">
        <ul className="space-y-2">
          {d.connected.map((c) => (
            <li key={c.symbol}>
              <Link href={`/s/${c.symbol}`} className="text-paper hover:text-gold">
                {c.name}
              </Link>
              <p className="text-[0.75rem] text-mute">{c.why}</p>
            </li>
          ))}
          {d.connected.length === 0 && <li className="text-mute">No group or industry peers in our records.</li>}
        </ul>
      </Card>

      <Card icon={Layers} title="Funds that hold this">
        {d.funds.length ? (
          <ul className="space-y-1.5">
            {d.funds.map((f) => (
              <li key={f.id} className="flex justify-between gap-2">
                <span className="text-paper">{f.name}</span>
                <span className="font-mono text-paper-dim">{pct(f.weight)}</span>
              </li>
            ))}
            <li className="text-[0.72rem] text-mute">Weights as disclosed {d.funds[0].asOf}.</li>
          </ul>
        ) : (
          <p className="text-mute">None of your funds disclosed this holding.</p>
        )}
      </Card>

      <Card icon={CalendarDays} title="Upcoming">
        {d.events.length ? (
          <ul className="space-y-2">
            {d.events.map((e) => (
              <li key={e.date + e.symbol}>
                <span className="font-mono text-[0.75rem] text-gold">{new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>{" "}
                <span className="text-paper">{e.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-mute">No dated events in the next 90 days.</p>
        )}
      </Card>

      <Card icon={Landmark} title="Your concentration">
        <ul className="space-y-1.5 text-paper-dim">
          {d.concentration.group && (
            <li>
              <span className="text-paper">{pct(d.concentration.group.share)}</span> of your money is in the {d.concentration.group.name} ({inr(d.concentration.group.inr, { compact: true })}).
            </li>
          )}
          {d.concentration.sector && (
            <li>
              <span className="text-paper">{pct(d.concentration.sector.share)}</span> is in {d.concentration.sector.name.toLowerCase()}.
            </li>
          )}
        </ul>
      </Card>

      {d.missed.length > 0 && (
        <Card icon={ArrowUpRight} title="Filings you might have missed">
          <ul className="space-y-2">
            {d.missed.map((m) => (
              <li key={m.id}>
                <a href={m.url} target="_blank" rel="noreferrer" className="text-paper hover:text-gold">
                  {m.title}
                </a>
                <p className="text-[0.72rem] text-mute">
                  {m.source} · {new Date(m.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="px-1 text-[0.72rem] leading-relaxed text-mute">For information, not a recommendation. Every reader sees the same items for the same story, in a fixed public order.</p>
    </div>
  );
}

/** Desktop: sticky side panel. Phone: bottom sheet. */
export function DiscoverPanel() {
  const { sheet, setSheet } = useRoom();
  return (
    <>
      <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto pb-8 xl:block" aria-label="Discover" data-lenis-prevent>
        <Body />
      </aside>
      {sheet && (
        <div className="fixed inset-0 z-[70] xl:hidden" role="dialog" aria-modal="true" aria-label="Discover">
          <button type="button" className="absolute inset-0 bg-ink/70 backdrop-blur-sm" aria-label="Close Discover" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[1.75rem] border-t border-line bg-ink-2 p-5 pb-10" data-lenis-prevent>
            <div className="mb-3 flex justify-between">
              <span className="mx-auto h-1 w-10 rounded-full bg-ink-4" aria-hidden="true" />
              <button type="button" onClick={() => setSheet(false)} className="absolute top-4 right-4 rounded-full p-2 text-paper-dim" aria-label="Close">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <Body />
          </div>
        </div>
      )}
    </>
  );
}

/** Discover, folded into a story page: related companies, funds and dates for that one story. */
export function DiscoverInline() {
  return (
    <section aria-label="Related" className="mt-12 border-t border-line pt-8">
      <Body />
    </section>
  );
}
