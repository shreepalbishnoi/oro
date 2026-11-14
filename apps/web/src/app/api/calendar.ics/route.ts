import { EVENTS } from "@/lib/fixtures/room";
import { entity } from "@/lib/room/compute";

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** GET /api/calendar.ics — Room calendar as iCalendar (PLAN §9.7 /room/calendar.ics). */
export async function GET() {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ORO//Room calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:ORO Room",
    ...EVENTS.flatMap((e) => {
      const d = e.date.replace(/-/g, "");
      return [
        "BEGIN:VEVENT",
        `UID:${d}-${e.symbol}-${e.kind.replace(/\s/g, "")}@oro`,
        `DTSTAMP:20261107T000000Z`,
        `DTSTART;VALUE=DATE:${d}`,
        `SUMMARY:${esc(`${entity(e.symbol).name}: ${e.title}`)}`,
        `DESCRIPTION:${esc(`${e.kind}. From ORO Room (sample data). Information, not advice.`)}`,
        "END:VEVENT",
      ];
    }),
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="oro-room.ics"' },
  });
}
