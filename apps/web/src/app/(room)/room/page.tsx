import type { Metadata } from "next";
import { StoryCard } from "@/components/room/story-card";
import { RoomTitle } from "@/components/room/room-title";
import { LAST_VISIT, STORIES } from "@/lib/fixtures/room";
import { exposureOf, inr } from "@/lib/room/compute";
import { RoomSwitch } from "@/components/room/live/mode";
import { LiveHome } from "@/components/room/live/live-home";

export const metadata: Metadata = { title: "Room" };

/** Stories ordered by priority = relevance × severity × Karat (PLAN §9.4, fixed formula). */
function priority(id: string) {
  const s = STORIES.find((x) => x.id === id)!;
  const x = exposureOf(s.symbol);
  const sev = s.severity === "high" ? 3 : s.severity === "medium" ? 2 : 1;
  return (x?.share ?? 0.001) * sev * (s.karat / 24);
}

function DemoRoomPage() {
  const since = STORIES.filter((s) => s.publishedAt >= "2026-11-04");
  const ordered = [...STORIES].sort((a, b) => priority(b.id) - priority(a.id));
  const flags = since.filter((s) => s.severity === "high");
  const exposed = since.reduce((a, s) => a + (exposureOf(s.symbol)?.total ?? 0), 0);

  return (
    <>
      <RoomTitle
        title={
          <>
            Since {LAST_VISIT}: {since.length} updates about {inr(exposed, { compact: true })} of your money. <span className="display-italic text-gold">{flags.length} are red flags.</span>
          </>
        }
      />

      <section aria-label="Summary" className="glass mb-10 rounded-[1.75rem] p-5 sm:p-6">
        <p className="eyebrow">In short</p>
        <ul className="mt-4 space-y-3 text-[0.98rem] leading-relaxed text-paper">
          <li>
            <span className="font-medium text-red">Red flag:</span> Nirmal Biotech&rsquo;s promoter pledged 31.2% of the company, up from 12%. You hold it only through Narmada Small Cap ({inr(exposureOf("NIRMALBIO")!.total)}).
          </li>
          <li>
            <span className="font-medium text-red">Rumour denied:</span> Surya Fincap says there is no merger with a foreign bank. The exchange also has it under extra surveillance. You hold it through Narmada Small Cap.
          </li>
          <li>
            <span className="font-medium text-green">Also filed:</span> Kaveri Power won a ₹420 crore order (forwards are claiming ₹4,200 crore). Himgiri recommended a 1:1 bonus. Meridian declared a ₹7 dividend; record date 20 Nov.
          </li>
        </ul>
        <p className="mt-4 text-[0.78rem] text-mute">Each line comes from a filing below. Values at the 7 Nov close.</p>
      </section>

      <h2 className="eyebrow mb-4">Most important first</h2>
      <div className="space-y-4">
        {ordered.map((s, i) => (
          <StoryCard key={s.id} story={s} featured={i === 0} />
        ))}
      </div>
      <p className="mt-8 text-center text-[0.8rem] text-mute">That&rsquo;s everything about your holdings this week. Past-event ranges are history, not a forecast.</p>
    </>
  );
}

/** Signed in: your Room from the API. Signed out: the fictional demo. */
export default function RoomPage() {
  return <RoomSwitch demo={<DemoRoomPage />} live={<LiveHome />} />;
}
