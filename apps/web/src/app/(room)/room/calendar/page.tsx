import type { Metadata } from "next";
import { CalendarDays, Download } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";
import { EVENTS } from "@/lib/fixtures/room";
import { entity } from "@/lib/room/compute";
import { fmtDate } from "@/lib/format";
import { RoomSwitch } from "@/components/room/live/mode";
import { LiveSoon } from "@/components/room/live/live-misc";

export const metadata: Metadata = { title: "Calendar" };

function DemoCalendarPage() {
  const months = [...new Set(EVENTS.map((e) => e.date.slice(0, 7)))];
  return (
    <>
      <RoomTitle icon={CalendarDays} eyebrow="Calendar" title={<>What&rsquo;s coming for the companies you own.</>} lede="Results, AGMs, votes and record dates for your stocks and your funds' top holdings." />
      <a href="/api/calendar.ics" download="oro-room.ics" className="btn btn-ghost mb-8 h-10 px-4 text-sm">
        <Download className="size-4" aria-hidden="true" /> Add to your calendar (.ics)
      </a>
      <div className="space-y-8">
        {months.map((m) => (
          <section key={m} aria-labelledby={`m-${m}`}>
            <h2 id={`m-${m}`} className="eyebrow mb-3">
              {fmtDate(`${m}-15`, { month: "long", year: "numeric" })}
            </h2>
            <ul className="space-y-2">
              {EVENTS.filter((e) => e.date.startsWith(m)).map((e) => (
                <li key={e.date + e.symbol + e.kind} className="flex items-center gap-4 rounded-2xl border border-line bg-ink-1/80 p-4">
                  <div className="w-14 shrink-0 text-center">
                    <p className="display text-3xl leading-none text-gold">{fmtDate(e.date, { day: "numeric" })}</p>
                    <p className="text-[0.8rem] font-medium text-mute">{fmtDate(e.date, { weekday: "short" })}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-paper">{e.title}</p>
                    <p className="text-[0.8rem] text-paper-dim">
                      {entity(e.symbol).name} · {e.kind}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

export default function CalendarPage() {
  return <RoomSwitch demo={<DemoCalendarPage />} live={<LiveSoon what="calendar" />} />;
}
